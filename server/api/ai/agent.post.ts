import { runAgentLoop } from '../../utils/agent'

const SYSTEM_PROMPT = `你是一个可以调用工具的笔记助手。

可用工具：
- get_current_time：获取当前日期和时间
- search_notes：检索用户的历史笔记
- save_note：保存一条新笔记

规则：
1. 涉及“现在/今天/几点”等时间相关判断时，先调用 get_current_time，不要自己猜时间。
2. 回答与笔记相关问题前，先调用 search_notes 检索，再基于检索结果作答；没有检索到就直说。
3. 用户要求保存/记录笔记时，调用 save_note，然后告诉用户已保存。
4. 不要编造笔记里没有的事实，回答简洁。`

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event)

  const question: string = String(body?.question ?? '').trim()
  const history: { role: 'user' | 'assistant', content: string }[] = Array.isArray(body?.history)
    ? body.history
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
        .slice(-6)
    : []

  // 登录校验放在写 SSE 头之前，失败时能正常返回 401
  const { user } = await requireUserSession(event)
  const userId = (user as { id: number }).id
  if (!userId) throw createError({ statusCode: 401, statusMessage: '未登录' })
  if (!question) throw createError({ statusCode: 400, statusMessage: '问题不能为空' })

  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  try {
    const answer = await runAgentLoop({
      apiKey: config.glmApiKey,
      system: SYSTEM_PROMPT,
      question,
      history,
      maxSteps: 5,
      onToken: token => send({ type: 'token', content: token }),
      onEvent: evt => send(evt),
    })
    send({ type: 'done', answer })
  } catch (err: any) {
    console.error('agent 运行失败:', err)
    send({ type: 'error', message: err?.message || '生成失败' })
  } finally {
    res.end()
  }
})
