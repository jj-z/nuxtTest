<script lang="ts" setup>
import type { User } from '~/types/index';

const props = defineProps<{
    user: User;
}>();
const emit = defineEmits<{
    (e: 'edit', user: User): void;
}>();


</script>

<template>
    <Teleport to="body">
        <Transition name="fade" mode="out-in">
            <div class="user-card">
                <p>姓名：<input type="text" v-model="props.user.name"></p>
                <p>邮箱：<input type="email" v-model="props.user.email"></p>
                <button @click="$emit('edit', props.user)">编辑</button>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped lang="scss">
.user-card {
    border: 1px solid #ccc;
    padding: 16px;
    border-radius: 8px;
    background-color: #f9f9f9;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
}
</style>