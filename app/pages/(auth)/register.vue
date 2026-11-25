<script setup lang="ts">
import { ref } from 'vue'

const name = ref('')
const email = ref('')
const phone = ref('')
const password = ref('')
const passwordConfirm = ref('')

const register = async () => {
    if (password.value !== passwordConfirm.value) {
        alert('两次输入的密码不一致')
        return
    }
    try {
        const res = await $fetch('/api/users/register', {
            method: 'POST',
            body: {
                name: name.value,
                email: email.value,
                phone: phone.value,
                password: password.value
            }
        })
        alert('注册成功')
    } catch (error) {
        console.error(error)
        alert('注册失败')
    }
}


</script>
<template>
    <h2>注册</h2>
    <div>
        <label for="name">用户名</label>
        <input type="text" v-model="name" />
    </div>
    <div>
        <label for="email">邮箱</label>
        <input type="text" v-model="email" />
    </div>
    <div>
        <label for="phone">手机号</label>
        <input type="text" v-model="phone" />
    </div>
    <div>
        <label for="password">密码</label>
        <input type="password" v-model="password" />
    </div>
    <div>
        <label for="passwordConfirm">确认密码</label>
        <input type="password" v-model="passwordConfirm" />
    </div>
    <div>
        <button  @click="register" >注册</button>
    </div>
    <div>
        <button @click="$router.push('/login')">去登录</button>
    </div>
</template>
<style scoped lang="scss"></style>