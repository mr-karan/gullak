<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useToast } from 'vue-toastification'
import { useTransactionStore } from '@/stores/transactions'
import { formatDate } from '@/utils/utils'

const toast = useToast()
const inputValue = ref('')
const isLoading = ref(false)
const editingTransaction = ref(null)
const transactionStore = useTransactionStore()

onMounted(fetchUnconfirmedTransactions)

async function fetchUnconfirmedTransactions() {
    try {
        const response = await axios.get(`/api/transactions?confirm=false`)
        transactionStore.setTransactions(response.data.data)
    } catch (error) {
        toast.error('Error fetching unconfirmed transactions: ' + error.message)
    }
}

const handleSubmit = async () => {
    try {
        isLoading.value = true
        const response = await axios.post(`/api/transactions`, {
            line: inputValue.value,
            confirm: false,
        })
        toast.success('Transaction saved successfully!')
        const newTransactions = response.data.data
        console.log(response.data)
        transactionStore.addTransactions(newTransactions)
        inputValue.value = ''
    } catch (error) {
        toast.error('Error saving transaction: ' + error.message)
    } finally {
        isLoading.value = false
    }
}

const editTransaction = (transaction) => {
    editingTransaction.value = { ...transaction }
}

const cancelEdit = () => {
    editingTransaction.value = null
}

const confirmTransaction = async (transaction) => {
    try {
        await axios.post(`/api/transactions/confirm`, { ...transaction, confirm: true })
        toast.success('Transaction confirmed!')
        transactionStore.removeTransaction(transaction.id)
    } catch (error) {
        toast.error('Error confirming transaction: ' + error.message)
    }
}

</script>

<template>
    <div class="bg-white p-6">
        <div class="mb-6">
            <h1 class="text-2xl font-bold mb-4">Add a new transaction</h1>
            <div class="flex gap-2">
                <input type="text" placeholder="Type something like '420 for groceries, 800 for phone bill'"
                    class="form-input flex-1" v-model="inputValue" minlength="5" maxlength="1000" required>
                <button class="btn-primary" :disabled="isLoading" @click="handleSubmit">
                    <span v-if="isLoading">Loading...</span>
                    <span v-else>Save transaction</span>
                </button>
            </div>
        </div>
        <div>
            <h2 class="text-xl font-semibold mb-4">Unconfirmed Transactions</h2>
            <div class="flex flex-col gap-2">
                <div v-for="transaction in transactionStore.transactions" :key="transaction.id"
                    class="transaction-card">
                    <span>{{ formatDate(transaction.created_at) }}</span>
                    <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                        v-model="editingTransaction.currency" class="form-input" />
                    <span v-else>{{ transaction.currency }}</span>
                    <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                        v-model="editingTransaction.amount" type="number" class="form-input" />
                    <span v-else>{{ transaction.amount }}</span>
                    <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                        v-model="editingTransaction.category" class="form-input" />
                    <span v-else>{{ transaction.category }}</span>
                    <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                        v-model="editingTransaction.description" class="form-input" />
                    <span v-else>{{ transaction.description }}</span>
                    <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                        v-model="editingTransaction.mode" class="form-input" />
                    <span v-else>{{ transaction.mode }}</span>
                    <button v-if="editingTransaction && editingTransaction.id === transaction.id" class="btn-secondary"
                        @click="cancelEdit">Cancel</button>
                    <button v-else class="btn-secondary" @click="editTransaction(transaction)">Edit</button>
                    <button class="btn-secondary"
                        @click="confirmTransaction(editingTransaction || transaction)">Confirm</button>
                </div>
            </div>
        </div>
    </div>
</template>
<style scoped>
.form-input {
    @apply bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5;
}

.btn-primary {
    @apply bg-yellow-400 hover:bg-yellow-500 text-white font-medium py-2 px-4 rounded transition-colors duration-200;
}

.btn-secondary {
    @apply bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-2 px-4 rounded transition-colors duration-200;
}

.transaction-card {
    @apply flex justify-between items-center bg-gray-100 p-4 rounded;
}
</style>
