export default defineAuthHandler(async (event,{userId}) => {
    const id = Number(getRouterParam(event, 'id'))
    //userId 判断userId是否有权限删除

    if (!Number.isInteger(id) || id <= 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid user id'
        })
    }

    const user = await prisma?.user.findUnique({
        where: {
            id
        },
    })

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: '用户不存在'
        })
    }

    try{
        await prisma?.user.update({
            where:{
                id
            },
            data:{
                deletedAt:new Date()
            }
        })
        return {
            
        }
    }catch(error){
        throw createError({
            statusCode: 500,
            statusMessage: 'Internal Server Error'
        })
    }

    // return await prisma?.user.delete({
    //     where: { id }
    // })
})