import { retrieveNotes } from '../../utils/retrieveNotes'
import { embedText } from '../../utils/embedding'
import { estimateTokens } from '../../utils/tokenEstimator'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event)
  const question: string = body.question
  console.log(question)
  // 前端传入当前会话的 ID（如果是新对话，可以为空）
  let sessionId: string | undefined = body.sessionId;

  // 假设你已经拿到了当前用户
  const { user } = await requireUserSession(event);
  const userId = (user as { id: number }).id
  if (!userId) throw createError({ statusCode: 401, statusMessage: '未登录' })

  // 1. 查用户余额
  const userToken = await prisma?.user.findUnique({ where: { id: userId } })
  if (!userToken) throw createError({ statusCode: 404 })



  // 2. 前置拦截：如果余额用完，直接返回假流并终止
  if (userToken.tokenUsed >= userToken.tokenLimit) {
    const res = event.node.res
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.write(`data: ${JSON.stringify({ token: '抱歉，您的 Token 额度已耗尽，请充值后再试。' })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  if (!question?.trim()) {
    throw createError({ statusCode: 400, statusMessage: '问题不能为空' })
  }

  // 1. 如果没有 SessionId，说明是新开了一个对话
  if (!sessionId) {
    const newSession = await prisma?.chatSession.create({
      data: {
        title: question.slice(0, 20), // 拿问题的前20个字当标题
        userId: userId.toString()
      }
    })
    sessionId = newSession?.id || ''
    if (!sessionId) throw createError({ statusCode: 500, statusMessage: '创建会话失败' })
  }

  // 2. 把用户的这次提问立刻存库
  await prisma?.message.create({
    data: { role: 'user', content: question, sessionId }
  })




  // 3. 【新增】拉取该会话的最近 6 条历史消息（3轮对话）
  const pastMessages = await prisma?.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 6
  }) as any[]
  if (!pastMessages || pastMessages.length === 0) {
    throw createError({ statusCode: 404, statusMessage: '会话不存在' })
  }
  // 注意：从数据库查出来是倒序的，必须翻转回正序，并且去掉刚刚存进去的这一次（因为下面会单独拼）
  const historyContext: any[] | undefined = pastMessages
    .reverse()
    .slice(0, -1)
    .map(m => ({ role: m.role, content: m.content }))

  // 4. 检索笔记
  // 优化：如果用户的提问是“这个怎么弄？”这种短句，可能检索不到笔记。
  // 用上一轮【用户】的提问和当前问题拼起来检索，效果更好（不要用 AI 的回答，太长会稀释语义）
  const lastUserMessage = [...(historyContext ?? [])].reverse().find(m => m.role === 'user')
  const searchQuery = lastUserMessage?.content?.trim()
    ? `${lastUserMessage.content.trim()}， ${question}`
    : question
  const notes = await retrieveNotes(searchQuery)
  // // 3. 检索相关笔记
  // const notes = await retrieveNotes(question)
  console.log(notes)



  // 4. 拼上下文
  const context = notes.length > 0
    ? notes.map((n, i) => `【笔记 ${i + 1}】标题：${n.title}\n内容：${n.content}`).join('\n\n')
    : '（没有找到相关笔记）'

  // 5. 构造 messages
  const messages = [
    {
      role: 'system',
      content: `你是一个基于用户笔记回答问题的助手。
以下是检索到的相关笔记：

${context}

规则：
1. 优先使用笔记中的信息回答。
2. 可以用自己的话重新组织、解释、补充过渡语句，但事实性内容必须来自笔记。
3. 如果笔记中没有相关信息，直接说“根据你的笔记，没有找到相关内容”。
4. 回答简洁，可以引用笔记标题。
5. 当用户要求保存、记录或记住一条笔记时，调用 save_node 工具，标题和内容都从用户的话里提炼。
6. 工具执行后，直接根据工具返回结果回复用户：成功就简短确认保存了什么，失败就说明原因，不要再套用第 3 条。`,
    },
    ...(historyContext ?? []),
    { role: 'user', content: question },
  ]

  // 6. 流式调用 GLM
  const res = event.node.res
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  // 把会话 ID 告诉前端，后续提问才能落到同一个会话里
  res.write(`data: ${JSON.stringify({ sessionId })}\n\n`)

  // 注意：这里不能在“没检索到笔记”时提前返回，
  // 否则「帮我保存一条笔记」这类请求只会拿到固定话术，永远走不到模型和工具调用。
  // 防止编造由 system prompt 里的规则约束。

  const ac = new AbortController()
  // 用 res 的 close 判定中断：正常结束时 writableEnded 为 true，不会误触发
  res.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })

  // 结算口径：有上游真实 usage 就用真实值，否则用「prompt + 已输出」估算兜底
  const promptTokens = estimateTokens(messages.map(m => m.content).join('\n'))
  let usageTotal = 0      // 上游返回的真实 usage（多轮调用累加）
  let outputText = ''     // 实际已输出的文本，用于中断/无 usage 时估算
  let reachedUpstream = false // fetch 是否成功拿到响应（网络失败则为 false）
  let upstreamFailed = false  // 上游返回非 2xx

  let fullAiResponse = '' // 用来记录 AI 完整说了什么

  const tools = [
    {
      type: 'function',
      function: {
        name: 'save_node',
        description: '当用户要求保存笔记、记录内容时调用此工具',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '笔记的标题' },
            content: { type: 'string', description: '笔记的具体内容' }
          },
          required: ['title', 'content']
        }
      }
    }
  ]

  // 调一次 GLM 流式接口：边解析边把 token 写给前端，同时把分片的 tool_calls 拼起来
  async function streamModel(msgs: any[]) {
    const upstream = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.glmApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        stream: true,
        stream_options: { include_usage: true }, // 让最后一个 chunk 带上 usage
        messages: msgs,
        temperature: 0.3,
        tools
      }),
      signal: ac.signal,
    })
    reachedUpstream = true

    if (!upstream.ok) {
      upstreamFailed = true
      const detail = await upstream.text()
      console.error('GLM 接口返回错误:', upstream.status, detail)
      throw new Error(`GLM 接口错误 ${upstream.status}`)
    }

    const reader = upstream.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let text = ''
    const callMap = new Map<number, any>()

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
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta

          const token = delta?.content
          if (token) {
            text += token
            outputText += token
            res.write(`data: ${JSON.stringify({ token })}\n\n`)
          }

          // tool_calls 在流里是分片返回的，必须按 index 累积 id / name / arguments
          for (const tc of delta?.tool_calls ?? []) {
            const idx = tc.index ?? 0
            const cur = callMap.get(idx) ?? { id: '', type: 'function', function: { name: '', arguments: '' } }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.function.name += tc.function.name
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments
            callMap.set(idx, cur)
          }

          if (json.usage) {
            usageTotal += json.usage.total_tokens
            console.log(`>>> 本次请求消耗 Token: ${json.usage.total_tokens}`)
          }
        } catch { /* 忽略无效行 */ }
      }
    }

    return { text, toolCalls: [...callMap.values()] }
  }

  try {
    // 第一轮：模型可能直接回答，也可能要求调用工具
    const first = await streamModel(messages)
    fullAiResponse += first.text

    if (first.toolCalls.length > 0) {
      // 执行工具：save_node 写库 + 生成向量
      const toolResults: { tool_call_id: string; content: string }[] = []

      for (const call of first.toolCalls) {
        if (call.function.name === 'save_node') {
          try {
            const args = JSON.parse(call.function.arguments || '{}')
            const title = String(args.title ?? '').trim()
            const content = String(args.content ?? '').trim()
            if (!title || !content) throw new Error('标题或内容为空')

            const created = await prisma?.note.create({ data: { title, content } })
            const vector = await embedText(`${title}\n${content}`)
            await prisma.$executeRaw`
              UPDATE "note" SET embedding = ${JSON.stringify(vector)}::vector WHERE id = ${created.id}
            `
            toolResults.push({ tool_call_id: call.id, content: `保存成功，笔记 ID 为 ${created.id}` })
          } catch (e: any) {
            toolResults.push({ tool_call_id: call.id, content: `保存失败：${e.message}` })
          }
        } else {
          toolResults.push({ tool_call_id: call.id, content: `不支持的工具：${call.function.name}` })
        }
      }

      // 第二轮：把 assistant 的 tool_calls 和工具结果回传，让模型生成最终回复
      // 第二轮要换掉 system prompt，否则原提示词里的“没找到就直说”会盖掉工具结果
      const followup = [
        {
          role: 'system',
          content: '你是笔记助手。用户刚才要求保存笔记，你已经调用 save_node 工具完成操作。请根据工具返回结果，用一句自然的话告诉用户结果，不要编造，也不要回复“没有找到相关内容”。'
        },
        ...messages.slice(1),
        { role: 'assistant', content: '', tool_calls: first.toolCalls },
        ...toolResults.map(r => ({ role: 'tool', tool_call_id: r.tool_call_id, content: r.content }))
      ]
      const second = await streamModel(followup)
      fullAiResponse += second.text

      // 兜底：模型没给出文字时，直接把工具结果告诉用户
      if (!second.text) {
        const fallback = toolResults.map(r => r.content).join('；')
        fullAiResponse += fallback
        res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // 连接已断开，不要再往 res 里写东西了，走估算扣费
      console.log('用户主动中断生成，触发估算扣费...')
    } else {
      console.error('RAG 流式请求失败:', err)
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: '生成失败' })}\n\n`)
        res.end()
      }
    }
  } finally {
    // 只扣一次：上游非 2xx 或没连上不扣；有真实 usage 用真实值；否则估算
    const cost = !reachedUpstream || upstreamFailed
      ? 0
      : usageTotal > 0
        ? usageTotal
        : promptTokens + estimateTokens(outputText)

    if (cost > 0) {
      prisma?.user.update({
        where: { id: userId },
        data: { tokenUsed: { increment: cost } },
      }).catch(err => console.error('更新额度失败:', err))

      console.log(`>>> 本次结算 Token: ${cost}${usageTotal > 0 ? '（上游 usage）' : '（估算）'}`)
    }

    // 4. 无论正常结束还是中断，只要 AI 说了话，就存进数据库
    if (fullAiResponse.length > 0) {
      await prisma?.message.create({
        data: { role: 'assistant', content: fullAiResponse, sessionId }
      }).catch(e => console.error('保存 AI 消息失败', e))

      // 顺便更新一下 Session 的时间，保证列表排序正确
      await prisma?.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() }
      })
    }
  }
})
