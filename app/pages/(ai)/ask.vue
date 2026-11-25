<!--
  这是「问我的笔记」页面（RAG 问答，没有工具调用）。
  整体思路：
  1. 页面加载时，先从后端拉最近一次会话的历史消息，恢复聊天记录
  2. 用户提问 → 把「问题 + sessionId」发给 /api/ai/ask
  3. 后端用 SSE 持续往回推：先推 sessionId，再一段段推回答文字
  4. 前端边收边渲染，所以文字是“一个字一个字”出现的

  和 agent.vue 的区别：
  - 这里没有工具调用，只有纯文字
  - 这里会把对话存到数据库，靠 sessionId 记住“这是同一个会话”
-->
<script setup lang="ts">
// 引入服务端写的 markdown 渲染函数，把 AI 回答的 markdown 转成 HTML
import { renderMarkdown } from '~~/server/utils/markdown'

// ===== 类型定义 =====

// 一条聊天消息：谁说的 + 说了什么（这个页面不需要工具轨迹）
interface ChatMessage {
  role: 'user' | 'assistant'   // 用户 / AI
  content: string              // 文字内容
}

// ===== 响应式状态：用 ref 包起来，值一变页面自动刷新 =====

const question = ref('')                  // 输入框内容
const messages = ref<ChatMessage[]>([])   // 聊天列表（模板里循环渲染它）
const loading = ref(false)                // 是否正在请求（控制按钮禁用和“回答中…”）
// 用来中断请求，实现「停止生成」按钮
let abortController: AbortController | null = null
// 当前会话 ID：第一次提问时后端创建并返回，后续提问带上它，历史才能串起来
const sessionId = ref<string | null>(null)

// ===== 核心函数：提问并接收流式回答 =====
async function ask() {
  // 空内容不发送；正在请求中也防止重复点击
  if (!question.value.trim() || loading.value) return

  // 先把输入内容存下来，再清空输入框（后面要多次用到这次的问题）
  const text = question.value
  question.value = ''
  loading.value = true
  // 每次请求新建一个控制器，才能单独中断这一次请求
  abortController = new AbortController()

  // 先把用户的问题显示出来（本地先显示，不等服务器）
  messages.value.push({ role: 'user', content: text })
  // 再插入一条空的 AI 消息占位，流式文字会陆续追加到这里
  messages.value.push({ role: 'assistant', content: '' })

  try {
    // 发请求：body 里带问题 + 当前 sessionId（首次为 null，后端会新建会话）
    const res = await fetch('/api/ai/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, sessionId: sessionId.value }),
      signal: abortController.signal,   // 交给 fetch，点击“停止”时能中断
    })

    // ===== 读取流式响应 =====
    // getReader() 可以分块读取响应，不用等全部内容下载完
    const reader = res.body!.getReader()
    // 把二进制数据解码成字符串
    const decoder = new TextDecoder()
    // 暂存“还没凑成完整一行”的残余数据
    let buffer = ''

    // 一直读，直到服务端关闭流（done 为 true）
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 每条消息以换行分隔，按行拆分
      const lines = buffer.split('\n')
      // 最后一段可能是半行，放回 buffer 等下次拼接
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        // SSE 固定格式是 "data: xxx"，不是这个前缀（比如空行）就跳过
        if (!trimmed.startsWith('data: ')) continue
        // 去掉前缀，拿到 JSON 字符串
        const payload = trimmed.slice(6)
        // 结束标记不是 JSON，跳过
        if (payload === '[DONE]') continue

        try {
          // 解析后端发来的数据对象
          const json = JSON.parse(payload)

          // 后端会把新建的会话 ID 推过来，存起来供下一次提问使用
          if (json.sessionId) sessionId.value = json.sessionId

          // 收到回答的文字片段：追加到最后一条 AI 消息里
          if (json.token) {
            const last = messages.value[messages.value.length - 1]
            if (last && last.role === 'assistant') last.content += json.token
          }

          // 后端报错：把错误信息显示在气泡里
          if (json.error) {
            const last = messages.value[messages.value.length - 1]
            if (last) last.content = json.error
          }
        } catch { /* 解析失败就跳过这一行，避免整页崩掉 */ }
      }
    }
  } catch (err: any) {
    // 用户点“停止”触发的中断不算错误，不显示报错
    if (err.name !== 'AbortError') {
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant') last.content = '请求失败，查看控制台'
      console.error(err)
    }
  } finally {
    // 无论成功、失败还是中断，都执行收尾
    loading.value = false
    abortController = null
    // 等页面更新后再滚动到底部，否则高度还没算出来
    nextTick(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    })
  }
}

// 点击“停止生成”：中断请求
function stop() {
  abortController?.abort()   // ?. 表示为空时不执行，避免报错
  loading.value = false
}

// ===== 页面加载时：恢复历史记录 =====
onMounted(async () => {
  try {
    // 1. 先问后端：这个用户有哪些会话（按更新时间倒序）
    const res = await $fetch('/api/chat/history') as { sessions: any[] }
    if (res.sessions && res.sessions.length > 0) {
      // 2. 取最近一次会话
      const latestSession = res.sessions[0]
      sessionId.value = latestSession.id

      // 3. 再拉这个会话的完整消息列表
      const history = await $fetch(`/api/chat/history?sessionId=${sessionId.value}`) as { messages: any[] }
      // 4. 转成页面需要的格式，直接渲染出来
      messages.value = (history.messages || []).map(m => ({
        role: m.role,
        content: m.content
      }))
    }
  } catch (e) {
    // 拉历史失败不影响提问，只在控制台报警
    console.error('加载历史失败', e)
  }
})
</script>

<template>
  <!-- 外层容器：限宽居中 -->
  <div style="max-width: 700px; margin: 2rem auto; font-family: sans-serif;">
    <h2>问我的笔记</h2>

    <!-- 聊天记录：有消息才显示 -->
    <div v-if="messages.length" style="margin-bottom: 16px;">
      <!-- 循环渲染每条消息 -->
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :style="{
          /* 用户消息靠右，AI 消息靠左 */
          textAlign: msg.role === 'user' ? 'right' : 'left',
          margin: '8px 0'
        }"
      >
        <!-- 文字气泡：宽度随内容自适应，最多占 80% -->
        <div
          :style="{
            display: 'inline-block',
            maxWidth: '80%',
            padding: '10px 14px',
            borderRadius: '10px',
            background: msg.role === 'user' ? '#d1e7ff' : '#f1f5f9',  /* 用户蓝、AI 灰 */
            color: '#0f172a',
            whiteSpace: 'pre-wrap',   /* 保留换行和空格 */
            lineHeight: 1.6,
            textAlign: 'left'          /* 外层右对齐，气泡内文字仍左对齐 */
          }"
          v-html="msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content"
        ></div>
        <!--
          v-html 渲染 HTML：AI 回答是 markdown，先转成 HTML；
          用户输入按纯文本显示（不做 markdown 解析，避免误解析）
        -->
      </div>

      <!-- 请求中且 AI 还没有任何文字时，显示“正在思考…” -->
      <div v-if="loading && !messages[messages.length - 1]?.content" style="text-align:left;color:#64748b;">
        正在思考…
      </div>
    </div>

    <!-- 输入框：双向绑定 question，回车也能发送 -->
    <input
      v-model="question"
      style="width: 100%; padding: 10px; font-size: 15px;"
      placeholder="比如：Prisma 一对多怎么写？"
      @keyup.enter="ask"
    />

    <!-- 按钮区 -->
    <div style="margin-top: 12px;">
      <!-- 请求中或输入为空时禁用，防止重复提交 -->
      <button :disabled="loading || !question.trim()" @click="ask">
        {{ loading ? '回答中...' : '提问' }}
      </button>
      <!-- 只在请求中显示，点击中断生成 -->
      <button v-if="loading" style="margin-left: 8px;" @click="stop">停止生成</button>
      <!-- 清空聊天并丢弃当前会话，下次提问会新建一个会话 -->
      <button style="margin-left: 8px;" @click="() => { messages = []; sessionId = null }">
        新对话
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* scoped：样式只作用于当前页面组件 */

/* 代码块背景、圆角、超长时横向滚动 */
.markdown-body pre {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
/* 行内代码用等宽字体 */
.markdown-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
}
/* 段落间距 */
.markdown-body p {
  margin-bottom: 10px;
}
</style>
