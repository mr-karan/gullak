<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useToast } from 'vue-toastification'
import { useTransactionStore } from '@/stores/transactions'
import { formatDate } from '@/utils/utils'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

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
      confirm: false
    })
    toast.success('Transaction saved. Please confirm!')
    const newTransactions = response.data.data
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
  <section class="new p-6">
    <div class="info mb-6">
      <h1 class="text-2xl font-bold">Add a new transaction</h1>
      <p class="text-gray-400">
        You can add a small description of your expenses and even add multiple expenses...
      </p>
    </div>
    <div class="form">
      <form @submit.prevent="handleSubmit" class="flex flex-col items-center space-y-4">
        <Textarea class="w-full textarea textarea-bordered"
          placeholder="Type something like '420 for groceries, 800 for phone bill'" v-model="inputValue" minlength="5"
          maxlength="1000" required />
        <Button class="bg-orange-600" :disabled="isLoading">
          <LucideSpinner v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Save transaction
        </Button>
      </form>
    </div>
  </section>
  <section class="unconfirmed p-6">
    <h2 class="text-xl font-semibold mb-4">Unconfirmed Transactions</h2>
    <div class="overflow-x-auto">
      <table class="table w-full">
        <thead>
          <tr>
            <th>Date</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Description</th>
            <th>Mode</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="transaction in transactionStore.transactions" :key="transaction.id">
            <td>{{ formatDate(transaction.created_at) }}</td>
            <td>
              <span>{{ transaction.currency }}{{ transaction.amount }}</span>
            </td>
            <td>
              <span class="badge badge-accent">{{ transaction.category }}</span>
            </td>
            <td>
              <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                v-model="editingTransaction.description" class="input input-bordered input-sm" />
              <span v-else>{{ transaction.description }}</span>
            </td>
            <td>
              <input v-if="editingTransaction && editingTransaction.id === transaction.id"
                v-model="editingTransaction.mode" class="input input-bordered input-sm" />
              <span v-else>{{ transaction.mode }}</span>
            </td>
            <td>
              <div class="flex space-x-2">
                <button v-if="editingTransaction && editingTransaction.id === transaction.id"
                  class="btn btn-ghost btn-sm hover:bg-neutral-800 hover:text-white" @click="cancelEdit">
                  Cancel
                </button>
                <button v-else class="btn btn-ghost btn-sm hover:bg-neutral-800 hover:text-white"
                  @click="editTransaction(transaction)">
                  Edit
                </button>
                <button class="btn btn-primary btn-sm hover:bg-neutral-800 hover:text-white"
                  @click="confirmTransaction(editingTransaction || transaction)">
                  Confirm
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
