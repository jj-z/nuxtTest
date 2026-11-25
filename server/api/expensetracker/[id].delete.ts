export default defineAuthHandler(async(event,{userId})=>{
    const id =Number(getRouterParam(event,'id'))
    if (!Number.isInteger(id) || id <= 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid id'
        })
    }
    let result: { count: number }
    try {
        result = await prisma.expense.updateMany({
            where: {
                id,
                userId,
                deletedAt: null
            },
            data: {
                deletedAt: new Date()
            }
        })
    } catch (error) {
        console.error('Failed to delete expense record:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Internal Server Error'
        })
    }

    if (result.count === 0) {
        throw createError({
            statusCode: 404,
            statusMessage: '记录不存在'
        })
    }

    return {
        statusCode: 200,
        statusMessage: 'success'
    }
})