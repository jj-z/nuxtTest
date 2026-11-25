export default defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event)
    const query = getQuery(event)
    const pageSize = 3;
    const cursorValue = query.cursor ? Number(query.cursor) : undefined
    if (cursorValue !== undefined && (!Number.isInteger(cursorValue) || cursorValue < 1)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid cursor'
        })
    }
    const cursor = cursorValue
    const direction = query.direction === 'prev' ? 'prev' : 'next'
    const userId = (user as { id: number }).id

    const cursorRecord = cursor
        ? await prisma.expense.findFirst({
            where: { id: cursor, userId },
            select: { id: true, date: true }
        })
        : null

    if (cursor && !cursorRecord) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Cursor record not found'
        })
    }

    const where = {
        userId,
        ...(cursorRecord
            ? {
                OR: direction === 'next'
                    ? [
                        { date: { lt: cursorRecord.date } },
                        { date: cursorRecord.date, id: { lt: cursorRecord.id } }
                    ]
                    : [
                        { date: { gt: cursorRecord.date } },
                        { date: cursorRecord.date, id: { gt: cursorRecord.id } }
                    ]
            }
            : {})
    }

    const record = await prisma.expense.findMany({
        where,
        take: pageSize,
        orderBy: direction === 'next'
            ? [{ date: 'desc' }, { id: 'desc' }]
            : [{ date: 'asc' }, { id: 'asc' }]
    })

    if (direction === 'prev') {
        record.reverse()
    }

    const firstRecord = record[0]
    const lastRecord = record[record.length - 1]

    const hasNext = lastRecord
        ? !!(await prisma.expense.findFirst({
            where: {
                userId,
                OR: [
                    { date: { lt: lastRecord.date } },
                    { date: lastRecord.date, id: { lt: lastRecord.id } }
                ]
            },
            select: { id: true }
        }))
        : false

    const hasPrev = firstRecord
        ? !!(await prisma.expense.findFirst({
            where: {
                userId,
                OR: [
                    { date: { gt: firstRecord.date } },
                    { date: firstRecord.date, id: { gt: firstRecord.id } }
                ]
            },
            select: { id: true }
        }))
        : false

    return {
        record,
        nextCursor: lastRecord?.id ?? null,
        prevCursor: firstRecord?.id ?? null,
        hasNext,
        hasPrev,
    }
})