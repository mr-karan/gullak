<!-- NewTransactions.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { showToast } from '@/utils/common'
import { Toaster } from '@/components/ui/toast'
import { useTransactionStore } from '@/stores/transactions'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader } from 'lucide-vue-next'
import TransactionTable from '@/components/TransactionTable.vue'

const inputValue = ref('')
const transactionStore = useTransactionStore()
const unconfirmedTransactions = ref([])

onMounted(async () => {
  await fetchUnconfirmedTransactions()
})

const fetchUnconfirmedTransactions = async () => {
  try {
    unconfirmedTransactions.value = await transactionStore.fetchTransactions(false);
  } catch (error) {
    showToast('Error loading transactions.', error.response?.data?.error || error.message, true);
  }
};

const handleSubmit = async () => {
  try {
    await transactionStore.createTransaction(inputValue.value);
    await fetchUnconfirmedTransactions();
    showToast('Transaction saved. Please confirm!', '', false);
    inputValue.value = '';
  } catch (error) {
    showToast('Error saving transaction.', error.response?.data?.error || error.message, true);
  }
};

const confirmTransactionHandler = async (transaction) => {
  transaction.confirm = true;
  try {
    await transactionStore.updateTransaction(transaction);
    await fetchUnconfirmedTransactions();
    showToast('Transaction confirmed!', '', false);
  } catch (error) {
    showToast('Error confirming transaction.', error.response?.data?.error || error.message, true);
  }
}

const deleteTransactionHandler = async (transaction) => {
  try {
    await transactionStore.deleteTransaction(transaction.id);
    await fetchUnconfirmedTransactions();
    showToast('Transaction deleted!', '', false);
  } catch (error) {
    showToast('Error deleting transaction.', error.response?.data?.error || error.message, true);
  }
}
</script>

<template>
  <Toaster />
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
  <section class="unconfirmed p-6" v-if="unconfirmedTransactions.length > 0">
    <h2 class="text-xl font-semibold mb-4">Unconfirmed Transactions</h2>
    <TransactionTable :transactions="unconfirmedTransactions" :show-confirm-button="true"
      :on-confirm="confirmTransactionHandler" :on-delete="deleteTransactionHandler" />
  </section>
</template>
