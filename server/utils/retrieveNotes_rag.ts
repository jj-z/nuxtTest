export interface RetrievedNote {
  title: string
  content: string
}

export async function retrieveNotes_rag(question: string, limit = 5): Promise<RetrievedNote[]> {
  // 把问题拆成关键词，去掉太短的词
  const keywords = question
    .split(/[\s,，。？?、！!；;：:]+/)
    .filter(w => w.length >= 2)

  if (keywords.length === 0) return []

  const notes = await prisma?.note.findMany({
    where: {
      OR: keywords.flatMap(kw => [
        { title: { contains: kw, mode: 'insensitive' } },
        { content: { contains: kw, mode: 'insensitive' } },
      ]),
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: { title: true, content: true },
  })

  return notes || []
}