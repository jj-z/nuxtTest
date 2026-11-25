// plugins/zod-locale.ts
import * as z from 'zod'

export default defineNuxtPlugin(() => {
  console.log('Zod locale plugin running')
  z.config(z.locales.zhCN())
})