// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'],
  app:{
    head: {
      title: 'Nuxt4-Auth-Utils | nuxt练习',
      meta: [
        { name: 'description', content: 'Nuxt4-Auth-Utils' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  },
  runtimeConfig: {
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || 'lCnyya1Xt+K5dtqQI/fUomJ85WNLnWrN1NvxC9gr42M=',
    session: {
      maxAge: 60 * 60 * 24 * 3, // 3天
      idleTimeout: 60 * 30 // 30分钟不操作即失效
    },
    uploadDir: process.env.UPLOAD_DIR || './uploads', // 私有，运行时读取
    glmApiKey: process.env.NUXT_GLM_API_KEY || '', // 私有，仅服务端可用
  },
  nitro: {
    publicAssets: [{ dir: './uploads', baseURL: '/uploads' }]
  }
})