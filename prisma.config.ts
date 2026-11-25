// prisma.config.ts
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  // schema: 'prisma/schema.prisma',
  schema: "prisma", // 关键：指向目录，不是 prisma/schema.prisma
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
})