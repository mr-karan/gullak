<!-- NewTransactions.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useTransactionStore } from '@/stores/transactions'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader } from 'lucide-vue-next'
import TransactionTable from '@/components/TransactionTable.vue'

const toast = useToast()
const inputValue = ref('')
const transactionStore = useTransactionStore()
const unconfirmedTransactions = ref([])

onMounted(async () => {
  await fetchUnconfirmedTransactions()
})

const fetchUnconfirmedTransactions = async () => {
  try {
    unconfirmedTransactions.value = await transactionStore.fetchTransactions(false)
  } catch (error) {
    toast.error('Error loading unconfirmed transactions: ' + error.message)
  }
}

const handleSubmit = async () => {
  try {
    await transactionStore.createTransaction(inputValue.value)
    await fetchUnconfirmedTransactions()
    toast.success('Transaction saved. Please confirm!')
    inputValue.value = ''
  } catch (error) {
    toast.error('Error saving transaction: ' + error.message)
  }
}

const confirmTransactionHandler = async (transaction) => {
  try {
    await transactionStore.updateTransaction(transaction)
    await fetchUnconfirmedTransactions()
    toast.success('Transaction confirmed!')
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
        <Button :disabled="transactionStore.isLoading">
          <Loader v-if="transactionStore.isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Save transaction
        </Button>
      </form>
    </div>
  </section>
  <section class="unconfirmed p-6">
    <h2 class="text-xl font-semibold mb-4">Unconfirmed Transactions</h2>
    <TransactionTable :transactions="unconfirmedTransactions" :show-confirm-button="true"
      :on-confirm="confirmTransactionHandler" />
  </section>
</template>
