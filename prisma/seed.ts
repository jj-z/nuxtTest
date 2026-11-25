// prisma/seed.ts
// npx tsx --env-file=.env prisma/seed.ts


import { prisma } from '../server/utils/db'

async function main() {
  const notes = [
    {
      title: '怎么在 Nuxt 里隐藏密钥',
      content: '不要在代码里硬编码敏感信息。应该在根目录建一个 .env 文件，把变量名加上 NUXT_ 前缀，比如 NUXT_API_SECRET。然后在 nuxt.config.ts 的 runtimeConfig 里声明，最后在 server 目录下用 useRuntimeConfig(event) 安全读取。'
    },
    {
      title: '大模型为什么会胡说八道',
      content: '因为 LLM 本质上是基于概率预测下一个 token，而不是去数据库里查证事实。当它缺乏相关知识时，依然会强行生成看似合理但完全虚构的内容，这在工程上被称为幻觉（Hallucination）。必须通过 Zod 校验或 RAG 来防御。'
    },
    {
      title: '前端处理打字机效果的底层逻辑',
      content: '不要用 EventSource，因为它不支持 POST 请求。要用原生 fetch 获取 ReadableStream，然后用 getReader() 逐块读取。重点是处理跨 chunk 的字符串截断问题，必须用 TextDecoder 加 buffer 缓冲来拼接，否则中文会乱码。'
    },
    {
      title: 'API 被恶意刷单了怎么办',
      content: '必须做限流和计费。每次请求大模型前，先查用户的 tokenLimit 余额，如果不够直接拦截。请求结束后，读取模型返回的 usage.total_tokens，用 Prisma 的 increment 原子操作扣除余额。即使中途 abort，也要通过估算输入输出字符来扣费。'
    },
    {
      title: '为什么数据库查不到我想要的内容',
      content: '传统的 contains 模糊查询只能匹配字面相同的字符串。如果用户问“怎么获取配置密钥”，而笔记写的是“隐藏敏感变量”，字面不同就查不到。解决方法是引入 Embedding 模型，把文本转成高维向量（数组），用 pgvector 去计算余弦距离。'
    },
    {
      title: '今天中午的午饭',
      content: '去楼下吃了一碗兰州拉面，加了两个煎蛋，花了 18 块钱。味道中规中矩，下次可以试试旁边的黄焖鸡。'
    }
  ]

  for (const note of notes) {
    await prisma.note.create({
      data: note
    })
  }
  console.log('✅ 成功插入了 6 篇测试笔记！')
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())