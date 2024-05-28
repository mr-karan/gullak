<script setup>
import { onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import TransactionTable from '@/components/TransactionTable.vue'
import { useTransactionStore } from '@/stores/transactions'

const toast = useToast()
const transactionStore = useTransactionStore()

onMounted(async () => {
  try {
    await transactionStore.fetchConfirmedTransactions()
  } catch (error) {
    toast.error('Error fetching confirmed transactions: ' + error.message)
  }
})

const saveTransactionHandler = async (transaction) => {
  try {
    await transactionStore.updateTransaction(transaction)
    toast.success('Transaction updated successfully!')
  } catch (error) {
    toast.error('Error updating transaction: ' + error.message)
  }
}
</script>

<template>
  <section class="p-6">
    <h1 class="text-2xl font-bold mb-4">All Transactions</h1>
    <TransactionTable :show-confirm-button="false" :on-save="saveTransactionHandler" />
  </section>
</template>
