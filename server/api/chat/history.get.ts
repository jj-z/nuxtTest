export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const userId = String((user as { id: number }).id)
  const query = getQuery(event)
  const sessionId = query.sessionId as string

  // 如果没传 sessionId，就拉取该用户的所有历史会话列表
  if (!sessionId) {
    const sessions = await prisma?.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 20
    })
    return { sessions }
  }

  // 校验会话归属，避免读到别人的记录
  const session = await prisma?.chatSession.findFirst({
    where: { id: sessionId, userId }
  })
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: '会话不存在' })
  }

  // 拉取这个会话里的所有聊天记录
  const messages = await prisma?.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' }
  })
  return { messages }
})
