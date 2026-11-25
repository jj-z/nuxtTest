export default defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event)

    const stat = await prisma?.expense.groupBy({
        by: ['year', 'month'],
        where: { userId:(user as {id:number}).id,type:'income',deletedAt:null },
        _count: true,
        _sum:{amount:true},
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
    })
    return stat
})