import { $fetch } from 'ofetch'

// 调用 GLM 把文本转成 2048 维向量，检索和写入共用
export async function embedText(text: string): Promise<number[]> {
  const key = process.env.NUXT_GLM_API_KEY || ''
  const res = await $fetch<{ data: { embedding: number[] }[] }>(
    'https://open.bigmodel.cn/api/paas/v4/embeddings',
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}` },
      body: { model: 'embedding-3', input: text }
    }
  )
  return res.data[0].embedding
}
