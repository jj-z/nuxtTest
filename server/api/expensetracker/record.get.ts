import { z } from 'zod'
export default defineAuthHandler(async (event, { userId }) => {
    // const { user } = await requireUserSession(event)
    // const userId = (user as { id: number }).id


    if (!userId) {
        throw createError({
            status: 401,
            statusMessage: 'Unauthorized'
        })
    }

    const query = getQuery(event)

    const bodySchma = z.object({
        page: z.coerce.number().int().min(1),
        pageSize: z.coerce.number().int().min(5).max(100)
    })

    const result = bodySchma.safeParse(query)

    if (!result.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'bad Requst',
            data: z.flattenError(result.error).fieldErrors
        })
    } else {
        try {
            const [total, record] = await prisma.$transaction([
                prisma.expense.count({
                    where: {
                        userId: userId,
                        deletedAt:null
                    }
                }),
                prisma.expense.findMany({
                    where: {
                        userId: userId,
                        deletedAt:null
                    },
                    skip: (result.data.page - 1) * result.data.pageSize,
                    take: result.data.pageSize,
                    orderBy: {
                        date: 'desc'
                    }
                })
            ])

            return { total, record, page: result.data.page, pageSize: result.data.pageSize }
        } catch (error) {
            console.error('Failed to fetch expense records:', error)
            throw createError({
                statusCode: 500,
                statusMessage: 'Internal Server Error'
            })
        }
    }





})