export default defineEventHandler(async (event) => {
    const { user } = await requireUserSession(event);
    const userId = (user as { id: number }).id;

    const stats = await prisma.$queryRaw<
        { month: Date; count: bigint;  totalMinutes: number }[]
    >`
  SELECT to_char("readDate" AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM') AS month,
   COUNT(*)::int AS count,
   SUM("durationMin")::int AS "totalMinutes"
  FROM "ReadingNote"
  WHERE "userId" = ${userId}
  GROUP BY month
  ORDER BY month DESC
`

    return stats.map(row => ({
        month: row.month,
        count: Number(row.count),   // BigInt → Number
        totalMinutes: row.totalMinutes
    }))
})