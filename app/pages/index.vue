<template>
   <main class="page">
      <div v-if="user">
         <!-- 功能：一个 UserCard 组件，接收 user 对象，显示姓名和邮箱，点击按钮抛出 edit 事件。 -->
         <p>显示用户信息</p>
         <p>姓名：{{ user.name }}</p>
         <p>邮箱：{{ user.email }}</p>
         <button @click="showModal = true">编辑</button>
         <user-edit-modal v-if="showModal" :user="user" @edit="handleEdit"> </user-edit-modal>
         <br />
         <p>功能一：一个阅读记录页：书名、作者、阅读时间，能按月统计</p>
         <router-link to="/readingNotes">去阅读记录页面</router-link>
         <br />
         <p>功能二：一个记账页：收入、支出、时间，能按月统计</p>
         <router-link to="/expenseTracker?page=1&limit=20">去记账页面</router-link>
         <br />
         <p>功能三：一个健身记录页：动作、组数、次数，能看趋势</p>
         <router-link to="/workoutLog">去运动日志页面</router-link>
         <br />
         <p>上传</p>
         <router-link to="/upload">上传</router-link>
         <br />
         <button @click="handleLogout">退出登录</button>
      </div>
      <div v-else>
         <p>用户未登录</p>
         <nuxt-link to="/login">去登录</nuxt-link>
      </div>
   </main>
</template>

<script setup lang="ts">
import type { User } from '~/types/index';
import UserEditModal from '~/components/UserEditModal.vue';

useSeoMeta({
  title: '首页 - 门户站',
  description: '门户站首页，聚合最新新闻与公告',
  ogTitle: '门户站首页',
  ogDescription: '门户站首页，聚合最新新闻与公告',
})

const showModal = ref(false);

const { data: user } = await useFetch<User>('/api/users/me');


const handleEdit = (updatedUser: User) => {
   user.value = updatedUser;
   showModal.value = false;
};

const handleLogout = async () => {
   try {
      await $fetch('/api/users/logout', {
         method: 'POST'
      });
      user.value = {
         id: '',
         name: '',
         email: ''
      };
      alert('退出登录成功');
   } catch (error) {
      console.error(error);
      alert('退出登录失败');
   }
};


</script>

<style scoped>
.page {
   min-height: 100vh;
}
</style>
