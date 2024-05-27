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
    <section class="p-6">
        <h1 class="text-2xl font-bold mb-4">All Transactions</h1>
        <div v-if="isLoading" class="text-center">
            <p>Loading...</p>
        </div>
        <div v-else>
            <div class="overflow-x-auto">
                <table class="table w-full">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th>Mode</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr class="hover" v-for="transaction in transactions" :key="transaction.id">
                            <td>{{ formatDate(transaction.created_at) }}</td>
                            <td>
                                <span>{{ transaction.currency }}{{ transaction.amount }}</span>
                            </td>
                            <td>
                                <span class="badge badge-primary">{{ transaction.category }}</span>
                            </td>
                            <td>{{ transaction.description }}</td>
                            <td>{{ transaction.mode }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</template>