import { prisma } from './db'
import { embedText } from './embedding'

export async function retrieveNotes(question: string, limit = 5) {
  // 1. 把问题转成向量
  const queryVector = await embedText(question)

  // 2. 用 pgvector 的 <=> 运算符计算余弦距离（越小越近）
  // ::vector 是类型转换，因为 Prisma 传进去的是 JSON 字符串
  const notes = await prisma.$queryRaw`
    SELECT id, title, content
    FROM "note"
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${JSON.stringify(queryVector)}::vector
    LIMIT ${limit}
  `
  
  return notes as { id: string, title: string, content: string }[]
}