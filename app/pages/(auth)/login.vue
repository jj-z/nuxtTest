<script setup lang="ts">
import { ref } from 'vue'

const email = ref('')
const password = ref('')
const route = useRoute()

const login = async () => {
    try {
        await $fetch('/api/users/login', {
            method: 'POST',
            body: {
                email: email.value,
                password: password.value
            }
        })
    } catch (error) {
        console.error(error)
        alert('登录失败')
        return
    }

    alert('登录成功')
    const redirect = route.query.redirect
    const destination = typeof redirect === 'string'
        && redirect.startsWith('/')
        && !redirect.startsWith('//')
        ? redirect
        : '/'
    await navigateTo(destination)
}


</script>
<template>
    <h2>登录</h2>
   
    <div>
        <label for="email">邮箱</label>
        <input type="text" v-model="email" />
    </div>
    
    <div>
        <label for="password">密码</label>
        <input type="password" v-model="password" />
    </div>
    
    <div>
        <button  @click="login" >登录</button>
    </div>
</template>
<style scoped lang="scss"></style>