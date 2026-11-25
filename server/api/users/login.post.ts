import bcrypt from 'bcrypt'

export default defineEventHandler(async (event) => {
    const body = await readBody(event);

    const user = await prisma?.user.findUnique({
        where: {
            email: body.email
        },
    })

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: '用户不存在'
        })
    }


    // 2. 比对密码
    const valid = await bcrypt.compare(body.password, user.passwordHash)

    if (!valid) {
        throw createError({ statusCode: 401, message: 'Invalid credentials' })
    }

    // 3. 写 session cookie
    await setUserSession(event, {
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    })

    return { id: user.id, email: user.email, name: user.name, phone: user.phone }

})