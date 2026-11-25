import { retrieveNotes } from './retrieveNotes'
import { embedText } from './embedding'
import { prisma } from './db'

const GLM_CHAT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, any>
  run: (args: any) => Promise<string>
}

export type AgentEvent =
  | { type: 'step', step: number }
  | { type: 'tool_start', name: string, args: any }
  | { type: 'tool_end', name: string, result: string }

export interface AgentRunOptions {
  apiKey: string
  model?: string
  system: string
  question: string
  history?: { role: 'user' | 'assistant', content: string }[]
  maxSteps?: number
  onToken?: (token: string) => void
  onEvent?: (event: AgentEvent) => void
}

interface ToolCallAcc {
  id: string
  name: string
  arguments: string
}

/** 把模型返回的 tool_calls 转成 OpenAI 兼容格式（回传给模型时要原样带上） */
function toAssistantToolCalls(calls: ToolCallAcc[]) {
  return calls.map(c => ({
    id: c.id,
    type: 'function',
    function: { name: c.name, arguments: c.arguments || '{}' },
  }))
}

/**
 * 调一轮 GLM（流式），边收边把正文 token 抛给上层，同时累积 tool_calls
 */
async function streamChat(opts: {
  apiKey: string
  model: string
  messages: any[]
  tools: any[]
  onToken?: (token: string) => void
}) {
  const upstream = await fetch(GLM_CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      temperature: 0.3,
      messages: opts.messages,
      tools: opts.tools,
    }),
  })

  if (!upstream.ok) {
    const detail = await upstream.text()
    throw new Error(`GLM 接口错误 ${upstream.status}: ${detail}`)
  }

  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  // GLM 的 tool_calls 是分片下发的：id 只在第一片，arguments 会跨多个 chunk
  const calls = new Map<number, ToolCallAcc>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const payload = trimmed.slice(6)
      if (payload === '[DONE]') continue

      let json: any
      try { json = JSON.parse(payload) } catch { continue }
      const delta = json.choices?.[0]?.delta
      if (!delta) continue

      if (delta.content) {
        content += delta.content
        opts.onToken?.(delta.content)
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0
          const cur = calls.get(index) ?? { id: '', name: '', arguments: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name && !cur.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments
          calls.set(index, cur)
        }
      }
    }
  }

  return {
    content,
    toolCalls: [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .filter(c => c.name),
  }
}

function formatNow(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const hour24 = d.getHours()
  const period = hour24 < 12 ? '上午' : '下午'
  const hour12 = hour24 % 12 || 12
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${period}${hour12}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 获取当前时间 */
const getCurrentTime: AgentTool = {
  name: 'get_current_time',
  description: '获取当前日期和时间。当用户询问时间，或需要根据时间做判断时调用。',
  parameters: { type: 'object', properties: {} },
  async run() {
    return formatNow()
  },
}

/** 检索笔记 */
const searchNotes: AgentTool = {
  name: 'search_notes',
  description: '根据关键词或问题检索用户的历史笔记，返回最相似的若干条。回答与用户笔记相关的问题前应该先调用它。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索用的关键词或完整问题' },
    },
    required: ['query'],
  },
  async run(args) {
    const query = String(args?.query ?? '').trim()
    if (!query) return '检索词为空'
    const notes = await retrieveNotes(query, 5)
    if (!notes.length) return '没有检索到相关笔记'
    return notes
      .map((n, i) => `【笔记 ${i + 1}】标题：${n.title}\n内容：${n.content}`)
      .join('\n\n')
  },
}

/** 保存笔记（同时生成向量，供后续检索） */
const saveNote: AgentTool = {
  name: 'save_note',
  description: '当用户要求保存、记录、新增一条笔记时调用。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '笔记标题' },
      content: { type: 'string', description: '笔记内容' },
    },
    required: ['title', 'content'],
  },
  async run(args) {
    const title = String(args?.title ?? '').trim()
    const content = String(args?.content ?? '').trim()
    if (!title || !content) return '保存失败：标题和内容都不能为空'

    const note = await prisma.note.create({ data: { title, content } })
    try {
      const vector = await embedText(`${title}\n${content}`)
      await prisma.$executeRaw`
        UPDATE "note" SET "embedding" = ${JSON.stringify(vector)}::vector WHERE id = ${note.id}
      `
    } catch (e: any) {
      return `笔记已保存（id=${note.id}），但向量生成失败：${e?.message ?? e}`
    }
    return `已保存笔记（id=${note.id}）：${title}`
  },
}

export const agentTools: AgentTool[] = [getCurrentTime, searchNotes, saveNote]

/**
 * Agent 循环：模型 → 调工具 → 把结果回传给模型 → 再决定下一步，
 * 直到模型不再要求调用工具，或达到 maxSteps。
 */
export async function runAgentLoop(opts: AgentRunOptions): Promise<string> {
  const model = opts.model ?? 'glm-4-flash'
  const maxSteps = opts.maxSteps ?? 5

  const messages: any[] = [
    { role: 'system', content: opts.system },
    ...(opts.history ?? []),
    { role: 'user', content: opts.question },
  ]

  const tools = agentTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))

  let answer = ''

  for (let step = 1; step <= maxSteps; step++) {
    console.log(`--- Agent 第 ${step} 步思考开始 ---`)
    opts.onEvent?.({ type: 'step', step })

    const { content, toolCalls } = await streamChat({
      apiKey: opts.apiKey,
      model,
      messages,
      tools,
      onToken: opts.onToken,
    })
    answer += content

    // 没有工具调用 → 模型给出了最终回复，循环结束
    if (!toolCalls.length) {
      console.log('--- Agent 任务完成，输出最终回答 ---')
      return answer
    }

    // 把模型的工具调用意图写回上下文（必须带 tool_calls 才能对上 tool_call_id）
    messages.push({
      role: 'assistant',
      content,
      tool_calls: toAssistantToolCalls(toolCalls),
    })

    for (const call of toolCalls) {
      let args: any = {}
      try { args = JSON.parse(call.arguments || '{}') } catch { /* 参数不合法时按空对象处理 */ }

      opts.onEvent?.({ type: 'tool_start', name: call.name, args })
      console.log(`>>> Agent 决定调用工具: ${call.name}，参数:`, args)

      const tool = agentTools.find(t => t.name === call.name)
      let result: string
      try {
        result = tool ? await tool.run(args) : `未找到名为 ${call.name} 的工具`
      } catch (e: any) {
        result = `工具执行失败：${e?.message ?? e}`
      }
      console.log(`>>> 工具执行结果: ${result}`)

      opts.onEvent?.({ type: 'tool_end', name: call.name, result })

      // 工具结果回传，模型下一轮据此生成回答
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  return answer || `（已达到最大步骤数 ${maxSteps}，仍未生成最终回复）`
}
