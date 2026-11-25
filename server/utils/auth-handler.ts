// server/utils/auth-handler.ts
export function defineAuthHandler<T>(
  handler: (event: H3Event, ctx: { userId: number }) => Promise<T>
) {
  return defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event)
    return handler(event, { userId: (user as { id: number }).id })
  })
}