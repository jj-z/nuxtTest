import 'dotenv/config'
import { prisma } from "./server/utils/db";
import { $fetch } from 'ofetch' // Nuxt 的底层 fetch，也可以用原生 fetch
// const createDepartment = await prisma.department.create({
//   data: {
//     name: "计算机科学与技术",
//     head: "院长张三",
//   }
// })
const createDepartment = { id: 2 };
// const createStudent = await prisma.student.create({
//   data: {
//     name: "学生李四", 
//     studentNumber: "2023001001",
//     age: 20,
//     departmentId: createDepartment.id, // Associate with the created department
//   }
// })

// const createCourse = await prisma.course.create({
//   data: {
//     name: "数据结构", 
//     credit: 3,
//     departmentId: createDepartment.id, // Associate with the created department
//   }
// })

// const createEnrollment = await prisma.enrollment.create({
//   data: {
//     studentId: 1, // Assuming the student with ID 1 exists  
//     courseId: 1,  // Assuming the course with ID 1 exists
//     grade: 95.5
//   }
// });

// async function main() {
//   // Example usage of the prisma client
//   const students = await prisma.student.findMany({
//     // where: {
//     //   departmentId: 1 // Example filter condition
//     // }
//   });
//   console.log(students);
// }
// main()

// 查学生，同时带出他的系和所有选课（含课程信息）
// const result = await prisma.student.findUnique({
//   where: { id: Number('1') },
//   include: {
//     department: true,          // 带出所属系
//     enrollments: {
//       include: { course: true } // 带出选课及对应课程
//     }
//   }
// })
// console.log(JSON.stringify(result, null, 2))


// await prisma.enrollment.update({
//   where: {
//     studentId_courseId: {
//       studentId: 1,
//       courseId: 1
//     }
//   },
//   data:{
//     grade: 88.5
//   }

// })


// await prisma.enrollment.delete({
//   where: {
//     studentId_courseId: { 
//       studentId: 1,
//       courseId: 10
//     }
//   }
// })


// await prisma.department.delete({
//   where: {
//     id: 2
//   }
// })
// const createOrder = async () => {
//   const result = await prisma.$transaction(async (tx) => {
//     const supplier = await tx.supplier.create({
//       data:{
//         name: "供应商A",
//       }
//     })
//     const groupPurchasePoint = await tx.groupPurchasePoint.create({
//       data:{
//         name: "团购点A",
//         supplierId: supplier.id
//       }
//     })

//     const product = await tx.product.create({
//       data:{
//         name: "苹果",
//         price: 15.99,
//       }
//     })  


//     const productDetail = await tx.productDetail.create({
//       data:{
//        productId: product.id,
//         groupPurchasePointId: groupPurchasePoint.id,
//         inventory: 100,
//       }
//     })
//     const customer = await tx.customer.create({
//       data:{
//         name: "客户A",
//       }
//     })

//     const order = await tx.order.create({
//       data:{
//         totalAmount: 250.75,  
//         status: "PENDING",
//         userId: customer.id,
//       }
//     })

//     const orderProduct = await tx.orderProduct.create({
//       data:{
//         orderId: order.id,
//         productId: product.id,
//         quantity: 30,
//         unitPrice: 15.99,
//       }
//     })

//     return { supplier, groupPurchasePoint, product, productDetail, customer, order, orderProduct };
//   });
// }
// try {
//   const result = await createOrder();
//   // 返回成功结果
// } catch (error) {
//   // 记录错误，并返回失败响应
//   throw error;
// }
const GLM_KEY = process.env.NUXT_GLM_API_KEY
async function getEmbedding(text: string): Promise<number[]> {
  const res = await $fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GLM_KEY}` },
    body: { model: 'embedding-3', input: text }
  })
  return res.data[0].embedding // 返回 2048 维数组
}

async function main() {
  console.log('开始向量化笔记')
  const notes = await prisma.note.findMany()
  console.log(`共 ${notes.length} 条笔记`)
  
  for (const note of notes) {
    // 把标题和内容拼起来生成向量
    const textToEmbed = `标题:${note.title}\n内容:${note.content}`
    const embedding = await getEmbedding(textToEmbed)
    
    // 用原生 SQL 更新字段
    await prisma.$executeRaw`
      UPDATE "note"
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${note.id}
    `
    console.log(`笔记 ${note.title} 向量化完成`)
  }
}
main()