import bcrypt from 'bcrypt'
export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    console.log('userPost-----', body);

    if (!body.name || !body.email || !body.phone || !body.password) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing required fields',
        });
    }

    try {
        const user = await prisma?.user.create({
            data: {
                name: body.name,
                email: body.email,
                phone: body.phone,
                passwordHash: await bcrypt.hash(body.password, 10),
            }

        })
        return {
            statusCode: 201,
            statusMessage: 'User created successfully',
            data: {
                id: user?.id,
                name: user?.name,
                email: user?.email,
                phone: user?.phone,
            }
        }
    }
    catch (error) {
        console.error('Error creating user:', error);
        throw createError({
            statusCode: 500,
            statusMessage: 'Internal Server Error',
        });
    }


})