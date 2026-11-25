<script setup lang="ts">
import type { User, UserPrisma } from '~/types/index'

const user = ref<User>({
    id: 0,
    name: '',
    email: ''
})

const { data: users, refresh } = await useFetch<User[]>('/api/users')

console.log('user=====', users.value)
async function addUser() {
    await $fetch('/api/users', {
        method: 'POST',
        body: {
            name: user.value.name,
            email: user.value.email
        }
    }) 

    // 刷新列表 & 清空表单
    await refresh()
    user.value.name = ''
    user.value.email = ''
}

async function delUser(id: number) {
    await $fetch(`/api/users/${id}`, {
        method: 'DELETE'
    })
    await refresh()
}

// async function updateUser(item: User) {
//     await $fetch(`/api/users/${item.id}`, {
//         method: 'PUT',
//         body: {
//             // ...item,
//             sex: item.sex == 'male' ? 'female' : 'male'
//         }
//     })
//     await refresh()
// }


async function updateUser(item:User) {
   try {
     await $fetch(  `/api/users/${item.id}`,{
        method:'PATCH',
        body:{
            sex:item.sex=='male'?'female':'male'
        }
    })
   }
   catch(error){
    console.log(error)
   }
    await refresh()
}

</script>
<template>
    <div>
        <label>用户名</label>
        <input type="text" v-model="user.name">
    </div>
    <div>
        <label>邮箱</label>
        <input type="text" v-model="user.email">
    </div>

    <button @click="addUser">addUser</button>
    <ul>
        <li v-for="item in users" :key="item.id">
            {{ item }}
            <hr>
            <div class="mb-20">操作：<button>跳转</button><button @click="delUser(Number(item.id))">删除</button><button
                    @click="updateUser(item)">修改状态</button>
            </div>
        </li>
    </ul>
</template>
<style scoped>
.mb-20 {
    margin-bottom: 2em;
}

.mb-20 button {
    margin-right: 20px;
}
</style>