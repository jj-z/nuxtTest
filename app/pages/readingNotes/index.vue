<script setup lang="ts">
definePageMeta({
    middleware: 'user'
})
const { user } = useAuth();
type ReadingNote = {
    id: string;
    name: string;
    author: string;
    readDate: Date;
    durationMin: number;
    progress: number; // 可选属性，表示阅读进度百分比
};

const { data: readingNotes, error } = await useFetch<ReadingNote[]>(
    '/api/readingNotes/note',
    {
        default: () => [],
    }
)


const { data: readStats } = await useFetch('/api/readingNotes/record')



const newNote = reactive<ReadingNote>({
    id: '',
    name: '',
    author: '',
    readDate: new Date(),
    durationMin: 0,
    progress: 0
});

const addReadingNote = async () => {
    try {
        const response = await $fetch<ReadingNote>('/api/readingNotes/note', {
            method: 'POST',
            body: newNote
        });
        readingNotes.value.push(response);
        // 重置表单
        newNote.name = '';
        newNote.author = '';
        newNote.readDate = new Date();
        newNote.durationMin = 0;
        newNote.progress = 0;
    } catch (error) {
        console.error(error);
        alert('添加阅读笔记失败');
    }
};

</script>
<template>
    <h2>阅读笔记</h2>
    <h4>一个阅读记录页：书名、作者、阅读时间，能按月统计</h4>
    <div>
        <p>这里是阅读笔记页面，只有登录用户才能访问。</p>
        <p>欢迎, {{ user?.name }}!</p>
    </div>
    <div class="readNotes">
        <h2>我的阅读笔记</h2>
        <ul v-if="readingNotes.length > 0">
            <li>
                <p>书名</p>
                <p>作者</p>
                <p>阅读时间(分钟)</p>
                <p>阅读日期</p>
                <p>阅读进度(%)</p>
            </li>
            <li v-for="note in readingNotes" :key="note.id">
                <p>{{ note?.name }}</p>
                <p>{{ note?.author }}</p>
                <p>{{ note?.durationMin }} </p>
                <p>{{ note?.readDate.toString().slice(0, 10) }}</p>
                <p>{{ note?.progress }}</p>
            </li>
        </ul>
        <p v-else>暂无阅读笔记</p>
    </div>
    <div>
        <h2>新增读书记录</h2>
        <form @submit.prevent="addReadingNote">
            <div>
                <label for="name">书名:</label>
                <input type="text" id="name" v-model="newNote.name" required />
            </div>
            <div>
                <label for="author">作者:</label>
                <input type="text" id="author" v-model="newNote.author" required />
            </div>
            <div>
                <label for="readDate">阅读日期:</label>
                <input type="date" id="readDate" v-model="newNote.readDate" required />
            </div>
            <div>
                <label for="durationMin">阅读时间(分钟):</label>
                <input type="number" id="durationMin" v-model.number="newNote.durationMin" required />
            </div>
            <div>
                <label for="progress">阅读进度(%):</label>
                <input type="number" id="progress" v-model.number="newNote.progress" min="0" max="100" />
            </div>
            <button type="submit">添加阅读笔记</button>
        </form>
    </div>
    <div>
        <h2>按月统计阅读时间</h2>
        <p>这里可以显示按月统计的阅读时间数据。{{ readStats }}</p>
    </div>
</template>
<style scoped lang="scss">
.readNotes {
    ul {
        li {
            display: flex;
            align-items: center;

            p {
                flex: 1;
                text-align: center;
                border: 1px solid #eee;
                border-collapse: collapse;
                line-height: 2;
            }
        }
    }
}
</style>