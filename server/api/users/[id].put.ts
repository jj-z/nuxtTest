export default defineEventHandler(async (event)=>{
    const id = Number(getRouterParam(event, 'id'))
    // const body = await readBody<{ sex?: string }>(event)
    const body = await readBody(event)

    if (!Number.isInteger(id) || id <= 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid user id'
        })
    }

    if (!body?.sex) {
        throw createError({
            statusCode: 400,
            statusMessage: 'The sex field is required'
        })
    }

    const user = await prisma?.user.update({
        where:{
            id
        },
        data:{
            sex:body.sex
        }
    })
    return user
})