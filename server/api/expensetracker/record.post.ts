
import { z } from 'zod'

// const bodySchma = z.object({
//     amount: z.number().min(0, {error:'不能小于0'}),
//     type: z.enum(['income', 'expense'],{error:'不能使用其他数据'}),
//     category: z.string().min(1,{error:'最少一个字'}),
//     date: z.coerce.date({error:'请输入正确的日期'})
// })

const bodySchema = z.object({
    amount: z.number().min(0),
    type: z.enum(['income', 'expense']),
    category: z.string().min(2),
    date: z.coerce.date()
})


export default defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event);
    const userId = (user as { id: number }).id;

    const body = await readBody(event)

    const result = bodySchema.safeParse(body)

    if (!result.success) {
        // const tree = z.treeifyError(result.error)
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Requst',
            // data: tree.properties, // 结构比 flatten 复杂，按需取用
            data:z.flattenError(result.error).fieldErrors
        })
    }

    try {
        const record = await prisma?.expense.create({
            data: {
                ...result.data,
                month: result.data.date.toISOString().slice(5, 7),
                year: result.data.date.toISOString().slice(0, 4),
                userId: userId
            }
        })
        return record
    } catch (error) {
        console.log(error)
        console.log(error instanceof Error ? error.message : "error 不是Error类型")
        throw createError({
            status: 500,
            statusMessage: 'Internal Server Error'
        })
    }




    // if (!body || typeof body !== 'object' || Array.isArray(body)) {
    //     throw createError({
    //         statusCode: 400,
    //         statusMessage: 'Request body is required'
    //     })
    // }

    // const amount = Number(body.amount)
    // const date = new Date(body.date)
    // if (
    //     body.amount === undefined ||
    //     body.amount === null ||
    //     body.amount === '' ||
    //     !Number.isFinite(amount) ||
    //     !body.date ||
    //     !Number.isFinite(date.getTime()) ||
    //     !body.type ||
    //     !body.category
    // ) {
    //     throw createError({
    //         statusCode: 400,
    //         statusMessage: 'Invalid expense record'
    //     })
    // }

    // try {
    //     const record = await prisma?.expense.create({
    //         data: {
    //             amount,
    //             type: body.type,
    //             category: body.category,
    //             date,
    //             month: date.toISOString().slice(5, 7),
    //             year: date.toISOString().slice(0, 4),
    //             userId: userId
    //         }
    //     })
    //     return record
    // } catch (error) {
    //     console.log(error)
    //     throw createError({
    //         status: 500,
    //         statusMessage: 'Internal Server Error'
    //     })
    // }
})