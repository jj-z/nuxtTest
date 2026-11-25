export default defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event);
    console.warn(user)
    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
        });
    }

    const readingNotes = await prisma?.readingNote.findMany({
        where: {
            userId: (user as { id: number }).id,
        },
        orderBy: {
            readDate: 'desc'   // 'asc' 升序 | 'desc' 降序
        }
    })
    return readingNotes;
})