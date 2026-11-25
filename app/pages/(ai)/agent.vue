<!--
  这是「Agent 笔记助手」页面。
  整体思路：
  1. 用户输入问题 → 前端把「问题 + 之前的聊天记录」发给后端 /api/ai/agent
  2. 后端用 SSE（Server-Sent Events）持续往回推数据：思考步骤、工具调用、回答文字
  3. 前端一边接收一边渲染，所以能看到“调用中 → 已调用”的过程，而不是等整段回答
-->
<script setup lang="ts">
// 引入服务端写的 markdown 渲染函数，用来把 AI 返回的 markdown 文本转成 HTML
import { renderMarkdown } from '~~/server/utils/markdown'

// ===== 类型定义：先约定数据长什么样，写起来不容易出错 =====

// 一次工具调用的轨迹（比如“调用了 get_current_time，参数是 {}，结果是 2026/...”）
interface ToolTrace {
  name: string                 // 工具名字，如 get_current_time / search_notes / save_note
  args?: any                   // 调用工具时传的参数（对象）
  result?: string              // 工具执行完返回的文字结果
  status: 'running' | 'done'   // 状态：正在调用 / 已调用完成
}

// 页面上的一条聊天消息（用户说的，或 AI 说的）
interface ChatMessage {
  role: 'user' | 'assistant'   // 谁说的：用户 / AI
  content: string              // 文字内容
  tools: ToolTrace[]           // AI 消息可能带工具调用记录；用户消息永远是空数组
}

// ===== 响应式状态：用 ref 包起来，值一变页面自动更新 =====

const question = ref('')                  // 输入框里的文字
const messages = ref<ChatMessage[]>([])   // 整个聊天列表（渲染时循环它）
const loading = ref(false)                // 是否正在请求中（控制按钮禁用、显示“运行中”）
const steps = ref(0)                      // 当前进行到第几轮思考，用于显示“第 N 轮思考中…”

// AbortController 用来实现「停止」：调用 abort() 就能中断正在进行的 fetch
let abortController: AbortController | null = null

// ===== 核心函数：发送问题并接收流式回答 =====
async function ask() {
  // 取出输入内容并去掉首尾空格
  const text = question.value.trim()
  // 空内容不发送；正在请求中也防止重复点击
  if (!text || loading.value) return

  // 先把「已有的所有消息」整理成历史记录，随请求一起发给后端
  // 注意：此时还没有 push 新消息，所以这里不包含本次提问，避免重复
  const history = messages.value.map(m => ({ role: m.role, content: m.content }))

  // 发送前清空输入框、进入 loading 状态、步骤归零
  question.value = ''
  loading.value = true
  steps.value = 0
  // 每次请求都新建一个控制器，方便这次请求单独被停止
  abortController = new AbortController()

  // 立刻把用户的问题显示到页面上（乐观更新：先显示，再去请求）
  messages.value.push({ role: 'user', content: text, tools: [] })
  // 先插入一条空的 AI 消息占位，后面流式往里追加文字
  messages.value.push({ role: 'assistant', content: '', tools: [] })

  // 拿到刚插入的那条 AI 消息对象。
  // 注意：后面一直操作这个对象，而不是每次去取数组最后一项，
  // 这样即使数组变化也不会追加错对象
  const current = messages.value[messages.value.length - 1]

  try {
    // 发起 POST 请求，请求体包含本次问题和历史记录
    const res = await fetch('/api/ai/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, history }),
      signal: abortController.signal,   // 把中断信号交给 fetch
    })

    // HTTP 状态码不是 2xx，或没有响应体，说明请求失败
    if (!res.ok || !res.body) {
      current.content = `请求失败：HTTP ${res.status}`
      return
    }

    // ===== 读取流式响应 =====
    // body.getReader() 可以一块一块地读数据，而不是等全部下载完
    const reader = res.body.getReader()
    // TextDecoder 把二进制数据（Uint8Array）解码成字符串
    const decoder = new TextDecoder()
    // buffer 用来暂存“还没凑成完整一行”的残余数据
    let buffer = ''

    // 死循环：直到服务端关闭流（done 为 true）才退出
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // 解码这一块数据，追加到缓冲区
      buffer += decoder.decode(value, { stream: true })

      // SSE 每条消息以换行分隔，这里按行拆开
      const lines = buffer.split('\n')
      // 最后一段可能是不完整的一行（还没收到换行符），先存回 buffer，等下次拼接
      buffer = lines.pop() || ''

      // 逐行处理已经完整的数据行
      for (const line of lines) {
        const trimmed = line.trim()
        // SSE 的格式固定是 "data: xxx"，不是这个前缀就跳过（可能是空行）
        if (!trimmed.startsWith('data: ')) continue
        // 去掉 "data: " 前缀，拿到真正的 JSON 字符串
        const payload = trimmed.slice(6)
        // 后端结束时会发送 [DONE]，它不是 JSON，直接跳过
        if (payload === '[DONE]') continue

        // 把 JSON 字符串解析成对象；解析失败就跳过这一行，避免整个流程崩掉
        let evt: any
        try { evt = JSON.parse(payload) } catch { continue }

        // 根据事件类型分别处理（这是前后端约定的协议）
        switch (evt.type) {
          // 后端开始新一轮思考：记录第几步
          case 'step':
            steps.value = evt.step
            break

          // 后端决定调用某个工具：先插入一条“调用中”的记录
          case 'tool_start':
            current.tools.push({ name: evt.name, args: evt.args, status: 'running' })
            break

          // 工具执行结束：找到同名的、还在“调用中”的那条记录，补上结果并改成“已调用”
          case 'tool_end': {
            // 从后往前找，保证同名工具多次调用时配对正确的最近一条
            const trace = [...current.tools].reverse().find(t => t.name === evt.name && t.status === 'running')
            if (trace) {
              trace.result = evt.result
              trace.status = 'done'
            }
            break
          }

          // AI 回答的文字片段：直接追加到当前消息，页面会实时变长
          case 'token':
            current.content += evt.content
            break

          // 全部结束：后端会带一份完整答案，用它校正流式拼接的结果
          // （防止流式过程中丢字，保证最终内容准确）
          case 'done':
            if (evt.answer) current.content = evt.answer
            break

          // 后端报错：把错误信息显示在气泡里
          case 'error':
            current.content = evt.message || '生成失败'
            break
        }
      }
    }
  } catch (err: any) {
    // 用户点“停止”触发的中断不算错误，不显示报错
    if (err.name !== 'AbortError') {
      current.content = '请求失败，查看控制台'
      console.error(err)
    }
  } finally {
    // 不论成功、失败还是中断，最后都要收尾
    loading.value = false         // 解除按钮禁用
    abortController = null        // 释放控制器
    // nextTick 等页面渲染完成后再滚动，否则滚动高度可能还没更新
    nextTick(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }))
  }
}

// 点击“停止”：中断请求。后端检测到连接断开后会停止生成
function stop() {
  abortController?.abort()   // ?. 表示 aborter 为空时不做任何事，避免报错
  loading.value = false
}

// 点击“新对话”：清空聊天列表和步骤计数
function reset() {
  messages.value = []
  steps.value = 0
}

// 把工具参数对象转成一行字符串显示，例如 {title:"下午茶"} 
function prettyArgs(args: any) {
  try { return JSON.stringify(args ?? {}) } catch { return String(args) }
}
</script>

<template>
  <!-- 外层容器：限宽居中，字体用系统默认无衬线 -->
  <div style="max-width: 760px; margin: 2rem auto; font-family: sans-serif;">
    <!-- 页面标题 -->
    <h2 style="margin-bottom: 4px;">Agent 笔记助手</h2>
    <!-- 一句说明，告诉用户这个页面的特点：能自己调工具 -->
    <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">
      模型会自己决定要不要检索或保存笔记，每一轮工具调用都会显示在回答上方。
    </p>

    <!-- 有消息时才渲染聊天区，避免空白占位 -->
    <div v-if="messages.length" style="margin-bottom: 16px;">
      <!-- 循环渲染每一条消息；用户消息靠右，AI 消息靠左 -->
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :style="{ textAlign: msg.role === 'user' ? 'right' : 'left', margin: '10px 0' }"
      >
        <!-- ===== 工具调用轨迹 ===== -->
        <!-- 只有这条消息有工具记录时才显示（用户消息永远是空数组，不会出现） -->
        <div v-if="msg.tools.length" style="max-width: 80%; display: inline-block; text-align: left;">
          <!-- 循环渲染每一次工具调用，一张小卡片 -->
          <div
            v-for="(t, ti) in msg.tools"
            :key="ti"
            style="margin-bottom: 6px; padding: 8px 10px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; font-size: 12px; color: #3730a3;"
          >
            <!-- 第一行：状态 + 工具名。running 时显示“调用中”，完成后显示“已调用” -->
            <div style="font-weight: 600;">
              {{ t.status === 'running' ? '调用中' : '已调用' }} · {{ t.name }}
            </div>
            <!-- 第二行：模型传给工具的参数 -->
            <div style="color: #4f46e5; word-break: break-all;">参数：{{ prettyArgs(t.args) }}</div>
            <!-- 第三行：工具返回结果。太长的截断到 300 字，避免撑爆页面 -->
            <div v-if="t.result" style="margin-top: 4px; color: #334155; white-space: pre-wrap;">
              结果：{{ t.result.length > 300 ? t.result.slice(0, 300) + '…' : t.result }}
            </div>
          </div>
        </div>

        <!-- ===== 文字气泡 ===== -->
        <!-- 用户消息一定显示；AI 消息要有内容才显示（空占位不显示空框） -->
        <div
          v-if="msg.content || msg.role === 'user'"
          :style="{
            display: 'inline-block',   /* 让气泡宽度随内容自适应 */
            maxWidth: '80%',           /* 最宽占容器的 80% */
            padding: '10px 14px',
            borderRadius: '10px',
            background: msg.role === 'user' ? '#d1e7ff' : '#f1f5f9',  /* 用户蓝、AI 灰 */
            color: '#0f172a',
            whiteSpace: 'pre-wrap',    /* 保留换行和空格 */
            lineHeight: 1.6,
            textAlign: 'left'          /* 外层是右对齐，气泡内部文字仍左对齐 */
          }"
          v-html="msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content"
        ></div>
        <!--
          v-html 用来渲染 HTML。AI 的回答是 markdown，先交给 renderMarkdown 转成 HTML；
          用户输入直接用纯文本即可（用 v-html 会原样显示 msg.content）
        -->
      </div>

      <!-- 正在请求、但 AI 还没有任何内容时，显示“第 N 轮思考中…” -->
      <div v-if="loading && !messages[messages.length - 1]?.content" style="color: #64748b; font-size: 13px;">
        第 {{ steps || 1 }} 轮思考中…
      </div>
    </div>

    <!-- 输入框：v-model 双向绑定 question；回车也能发送 -->
    <input
      v-model="question"
      style="width: 100%; padding: 10px; font-size: 15px;"
      placeholder="试试：帮我保存一条笔记；或者：我之前记过 Prisma 的内容吗？"
      @keyup.enter="ask"
    />

    <!-- 按钮区 -->
    <div style="margin-top: 12px;">
      <!-- 请求中或输入为空时禁用，防止重复提交 -->
      <button :disabled="loading || !question.trim()" @click="ask">
        {{ loading ? '运行中...' : '发送' }}
      </button>
      <!-- 只在请求中显示“停止”，点击会中断当前请求 -->
      <button v-if="loading" style="margin-left: 8px;" @click="stop">停止</button>
      <!-- 清空当前对话，重新开始 -->
      <button style="margin-left: 8px;" @click="reset">新对话</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* scoped 表示这些样式只对当前页面生效，不会污染其他页面 */

/* 代码块背景和圆角 */
.markdown-body pre {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;   /* 代码太长时横向滚动，不撑破布局 */
}
/* 行内代码用等宽字体 */
.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}
/* 段落之间留点间距 */
.markdown-body p {
  margin-bottom: 10px;
}
</style>
