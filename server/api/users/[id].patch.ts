export default defineEventHandler(async (event) => {
    const id = Number(getRouterParam(event, 'id'));
    const body = await readBody(event);
    if (id <= 0 || !Number.isInteger(id)) {
        throw createError({
            status: 400,
            message: 'Invalid user id'
        })
    }
    if (!body?.sex) {
        throw createError({
            status: 400,
            message: "The sex field is required"
        })
    }
    const user = await prisma?.user.update({
        where: {
            id: id
        },
        data: {
            sex: body.sex
        }
    })
    return user
})