<script setup lang="ts">
import { reactive } from 'vue';

definePageMeta({
    middleware: 'user'
})
useSeoMeta({
  title: '记账页面',
  description: '管理您的记账记录',
})


const route = useRoute();
console.log(route.query)

const { user } = useAuth();

type Record = {
    id: string,
    amount: number,
    type: string,
    category: string,
    date: string
}

type RecordPage = {
    total: number,
    record: Record[],
    page: number,
    pageSize: number
}
// const cursor = ref<string | number | undefined>(undefined)
// const direction = ref<'next' | 'prev'>('next')

// const { data: records, refresh } = await useFetch('/api/expensetracker/recordCursor', {
//     query: computed(() => ({
//         cursor: cursor.value,
//         direction: direction.value
//     })),
//     default: () => ({
//         record: [],
//         nextCursor: '',
//         prevCursor: '',
//         hasNext: false,
//         hasPrev: false,
//     }),
//     watch: false,
// })
// const handlePrev = async () => {
//     if (!records.value?.hasPrev) return
//     direction.value = 'prev'
//     cursor.value = records.value.prevCursor ?? undefined
//     await refresh()
// }
// const handleNext = async () => {
//     if (!records.value?.hasNext) return
//     direction.value = 'next'
//     cursor.value = records.value.nextCursor ?? undefined
//     await refresh()
// }


const page = ref(1)
const pageSize = 5
const deletingRecordId = ref<string | null>(null)
const deleteFeedback = ref('')
const deleteError = ref('')

const { data: records, error: recordsError, refresh } = await useFetch<RecordPage>('/api/expensetracker/record', {
    query: { page, pageSize },
    default: () => ({ total: 0, record: [], page: 1, pageSize }),
})

const newRecord = reactive<Record>({
    id: '',
    amount: 0,
    type: '',
    category: '',
    date: ''
})

const addRecord = async () => {
    console.log({ ...newRecord })
    try {
        await $fetch('/api/expensetracker/record', {
            method: 'POST',
            body: {
                ...newRecord
            }
        })
        refresh();
        refresh1();
    } catch (error) {
        console.log(error);
        if (error instanceof Error) {
            const fetchError = error as Error & { data?: { message?: string } };
            console.log(fetchError.data)
            alert(fetchError.data?.message ?? error.message)
        }

    }
}
const { data: readStats, refresh: refresh1 } = await useFetch('/api/expensetracker/stat', { default: () => [] })


const handleDelete = async (record: Record) => {
    deletingRecordId.value = record.id
    deleteFeedback.value = ''
    deleteError.value = ''

    try {
        await $fetch(`/api/expensetracker/${record.id}`, {
            method: 'DELETE',
        })
    } catch (error) {
        deleteError.value = error instanceof Error ? error.message : '删除失败，请稍后重试'
        deletingRecordId.value = null
        return
    }

    deleteFeedback.value = '记录已删除'

    try {
        await Promise.all([refresh(), refresh1()])

        if (records.value.record.length === 0 && page.value > 1) {
            page.value = Math.max(1, Math.ceil(records.value.total / pageSize))
            await refresh()
        }
    } catch (error) {
        deleteError.value = `记录已删除，但页面刷新失败：${error instanceof Error ? error.message : '未知错误'}`
    } finally {
        deletingRecordId.value = null
    }
}

</script>
<template>
    <h2>记账页面</h2>
    <h4>欢迎{{ user }}</h4>

    <div class="readNotes">
        <h2>记账记录（共 {{ records.total }} 条）</h2>
        <p v-if="recordsError" role="alert">加载记账记录失败：{{ recordsError.message }}</p>
        <p v-if="deleteFeedback" role="status">{{ deleteFeedback }}</p>
        <p v-if="deleteError" role="alert">{{ deleteError }}</p>
        <ul v-if="records.record.length > 0">
            <li>
                <p>金额</p>
                <p>类型</p>
                <p>类别</p>
                <p>日期</p>
                <p>操作</p>
            </li>
            <li v-for="record in records.record" :key="record.id">
                <p>{{ record.amount }}</p>
                <p>{{ record.type === 'income' ? '收入' : '支出' }}</p>
                <p>{{ record.category }}</p>
                <p>{{ record.date.slice(0, 10) }}</p>
                <p>
                    <button
                        type="button"
                        :disabled="deletingRecordId !== null"
                        @click="handleDelete(record)"
                    >
                        {{ deletingRecordId === record.id ? '删除中…' : '删除' }}
                    </button>
                </p>
            </li>
        </ul>
        <p v-else>暂无记账记录</p>
        <div>
            <button type="button" :disabled="page <= 1" @click="page--">上一页</button>
            <button v-for="value in Math.ceil(records.total / records.pageSize)" @click="page = Number(value)"
                :disabled="value == page">{{ value }}</button>
            <span>第 {{ records.page }} 页</span>
            <button type="button" :disabled="records.page * records.pageSize >= records.total" @click="page++">
                下一页
            </button>
        </div>
        <hr>
        <!-- <div>
            <button :disabled="!records?.hasPrev" @click="handlePrev">
                上一页
            </button>
            <button :disabled="!records?.hasNext" @click="handleNext">
                下一页
            </button>
        </div> -->
    </div>
    <div>
        <h2>新增记账记录</h2>
        <form @submit.prevent="addRecord">
            <div>
                <label for="name">金额:</label>
                <input type="number" id="amount" v-model="newRecord.amount" required />
            </div>
            <div>
                <label for="author">支出/收入:</label>
                <input type="text" id="type" v-model="newRecord.type" required />
            </div>
            <div>
                <label for="readDate">费用类别:</label>
                <input type="text" id="category" v-model="newRecord.category" required />
            </div>
            <div>
                <label for="durationMin">费用日期:</label>
                <input type="date" id="date" v-model="newRecord.date" required />
            </div>

            <button type="submit">添加记录</button>
        </form>
    </div>
    <div>
        <h2>按月统计</h2>
        <p>这里可以显示按月统计的数据。{{ readStats }}</p>
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