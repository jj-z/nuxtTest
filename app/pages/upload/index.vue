<script setup lang="ts">
definePageMeta({
    middleware: 'user'
})

const form = reactive({
    title: '',
    file: null as File | null,
})

const previewUrl = ref<string | null>(null)
const submitting = ref(false)
const result = ref<{ url: string; originalSize: number; compressedSize: number } | null>(null)
const errorMsg = ref('')

const onFileChange = async (e: Event) => {
    console.log(e)
    const input = e.target as HTMLInputElement
    const file = input.files?.[0] ?? null
    form.file = file
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = file ? URL.createObjectURL(file) : null
}
async function onSubmit() {
    errorMsg.value = ''
    result.value = null

    if (!form.file) {
        errorMsg.value = '请选择文件'
        return
    }

    const fd = new FormData()
    fd.append('file', form.file)
    fd.append('title', form.title)

    submitting.value = true
    try {
        result.value = await $fetch('/api/upload/up', {
            method: 'POST',
            body: fd,
        })
    } catch (e: any) {
        if (e?.statusCode === 401 || e?.response?.status === 401) {
            await navigateTo({ path: '/login', query: { redirect: '/upload' } })
            return
        }
        errorMsg.value = e?.data?.message || '上传失败'
    } finally {
        submitting.value = false
    }
}
</script>
<template>
    <h2>上传</h2>
    <p>图片上传</p>
    <form @submit.prevent="onSubmit">
        <input type="text" v-model="form.title">
        <input type="file" accept="image/jpeg,image/png,image/webp" @change="onFileChange">
        <div v-if="previewUrl">
            <img :src="previewUrl" alt="预览" class="max-h-48 rounded border" style="max-width: 200px;max-height: 200px;">
        </div>
        <p v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</p>
        <button type="submit" :disabled="submitting">{{ submitting ? '上传中...' : '上传' }}</button>
    </form>
    <div v-if="result" class="border-t pt-3 space-y-2">
        <p class="text-green-600">上传成功</p>
        <img :src="result.url" alt="上传结果" class="max-h-48 rounded border">
        <p class="text-sm text-gray-600">
            原始 {{ (result.originalSize / 1024).toFixed(1) }} KB →
            压缩后 {{ (result.compressedSize / 1024).toFixed(1) }} KB
        </p>
    </div>
</template>
<style scoped lang="scss"></style>