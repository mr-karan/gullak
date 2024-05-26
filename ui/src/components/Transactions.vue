<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useToast } from 'vue-toastification'
import { formatDate } from '@/utils/utils'

const toast = useToast()
const transactions = ref([])
const isLoading = ref(true)

onMounted(fetchConfirmedTransactions)

async function fetchConfirmedTransactions() {
    try {
        const response = await axios.get(`/api/transactions?confirm=true`)
        transactions.value = response.data.data
    } catch (error) {
        toast.error('Error fetching confirmed transactions: ' + error.message)
    } finally {
        isLoading.value = false
    }
}

</script>

<template>
    <div class="bg-white p-6">
        <h1 class="text-2xl font-bold mb-4">Confirmed Transactions</h1>
        <div v-if="isLoading" class="text-center">
            <p>Loading...</p>
        </div>
        <div v-else>
            <table class="table-auto w-full">
                <thead>
                    <tr>
                        <th class="px-4 py-2">Date</th>
                        <th class="px-4 py-2">Amount</th>
                        <th class="px-4 py-2">Category</th>
                        <th class="px-4 py-2">Description</th>
                        <th class="px-4 py-2">Mode</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="transaction in transactions" :key="transaction.id">
                        <td class="border px-4 py-2">{{ formatDate(transaction.created_at) }}</td>
                        <td class="border px-4 py-2">{{ transaction.currency }} {{ transaction.amount }}</td>
                        <td class="border px-4 py-2">{{ transaction.category }}</td>
                        <td class="border px-4 py-2">{{ transaction.description }}</td>
                        <td class="border px-4 py-2">{{ transaction.mode }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>