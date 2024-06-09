<template>
    <section class="p-6">
        <div class="flex flex-wrap items-center justify-between py-4">
            <h1 class="text-2xl font-semibold text-gray-800 flex-1">Dashboard Overview</h1>
            <DateRangePicker v-model="dateRange" @update:dateRange="handleDateRangeUpdate" class="flex-initial" />
        </div>
        <div class="charts mt-4 flex flex-wrap justify-center items-stretch">
            <div class="w-full md:w-1/2 p-2">
                <DonutChart :data="categoriesData" index="name" :category="'total'" class="w-full h-full" />
            </div>
            <div class="w-full md:w-1/2 p-2">
                <AreaChart :data="dailyData" index="transaction_date" :categories="['total_spent']"
                    class="w-full h-[200px]" :show-grid-line="false" :show-legend="false"
                    :curve-type="CurveType.Basis" />
            </div>
        </div>
        <div class="transactions mt-4">
            <h2 class="text-2xl font-semibold text-gray-800 mb-4">Transactions Log</h2>
            <TransactionTable :transactions="transactions" :on-save="saveTransactionHandler" />
        </div>
    </section>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { DonutChart } from '@/components/ui/chart-donut';
import { AreaChart } from '@/components/ui/chart-area'
import { CurveType } from '@unovis/ts';
import { useToast } from 'vue-toastification';
import DateRangePicker from '@/components/DateRangePicker.vue';
import TransactionTable from '@/components/TransactionTable.vue';
import { useTransactionStore } from '@/stores/transactions';

const toast = useToast();
const transactionStore = useTransactionStore();

const categoriesData = ref([]);
const dailyData = ref([]);
const transactions = ref([]);
const dateRange = ref({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),  // 30 days ago
    end: new Date().toISOString().slice(0, 10)  // Today
});

const fetchData = async () => {
    try {
        const [dailySpending, categories, transData] = await Promise.all([
            transactionStore.fetchDailySpending(dateRange.value.start, dateRange.value.end),
            transactionStore.fetchTopExpenseCategories(dateRange.value.start, dateRange.value.end),
            transactionStore.fetchTransactions(true, dateRange.value.start, dateRange.value.end)
        ]);
        dailyData.value = dailySpending.map(day => ({
            transaction_date: day.transaction_date,
            total_spent: day.total_spent
        }));
        categoriesData.value = categories.map(item => ({
            name: item.category,
            total: item.total_spent
        }));
        transactions.value = transData;
    } catch (error) {
        console.error("Error fetching data:", error);
        toast.error('Error fetching data: ' + error.message);
    }
}

const saveTransactionHandler = async (transaction) => {
    try {
        await transactionStore.updateTransaction(transaction);
        toast.success('Transaction updated successfully!');
        fetchData();
    } catch (error) {
        toast.error('Error updating transaction: ' + error.message);
    }
}

// When the date range is updated, fetch new data.
const handleDateRangeUpdate = (newDates) => {
    dateRange.value = { ...dateRange.value, start: newDates.start, end: newDates.end };
    fetchData();
};

onMounted(fetchData);
watch(dateRange, fetchData, { deep: true });
</script>
