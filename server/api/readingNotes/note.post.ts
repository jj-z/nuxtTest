export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { user } = await requireUserSession(event);

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
        });
    }
    if (!body.name || !body.author || !body.readDate || !body.durationMin || !body.progress) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
        });
    }

    const readingNote = await prisma?.readingNote.create({
        data: {
            name: body.name,
            author: body.author,
            readDate: new Date(body.readDate),
            durationMin: body.durationMin,
            progress: body.progress,
            userId: (user as { id: number }).id,
        }
    });
    return readingNote;
});