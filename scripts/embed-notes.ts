// 必须放在所有 import 的最前面
import 'dotenv/config'

// import { PrismaClient } from '@prisma/client'
import { $fetch } from 'ofetch'

// const prisma = new PrismaClient()
const GLM_KEY = process.env.NUXT_GLM_API_KEY

import { prisma } from '../../server/utils/db'

// 下面保留你原来的逻辑，但可以删掉之前的 dotenv.config() 那一行

async function getEmbedding(text: string): Promise<number[]> {
  const res = await $fetch('https://open.bigmodel.cn/api/paas/v4/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GLM_KEY}` },
    body: { model: 'embedding-3', input: text }
  })
  return res.data[0].embedding // 返回 2048 维数组
}

async function main() {
  const notes = await prisma.note.findMany()
  
  for (const note of notes) {
    // 把标题和内容拼起来生成向量
    const textToEmbed = `标题:${note.title}\n内容:${note.content}`
    const embedding = await getEmbedding(textToEmbed)
    
    // 用原生 SQL 更新字段
    await prisma.$executeRaw`
      UPDATE "Note"
      SET embedding = ${JSON.stringify(embedding)}::vector
      WHERE id = ${note.id}
    `
    console.log(`笔记 ${note.title} 向量化完成`)
  }
}
main()