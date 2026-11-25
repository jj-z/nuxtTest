<script setup lang="ts">    
const route = useRoute()
// slug 是数组，例如访问 /a/b/c，slug = ['a','b','c']
const fullPath = computed(() => '/' + (route.params.slug as string[]).join('/'))
</script>
<template>
<div>
    <h1>页面未找到</h1>
    <p>你访问的路径是：{{ fullPath }}</p>
    <NuxtLink to="/">返回首页</NuxtLink>
  </div>
</template>
<style scoped lang="scss">

</style>