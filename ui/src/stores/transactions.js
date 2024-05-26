import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTransactionStore = defineStore('transaction', () => {
  const transactions = ref([])
  const isLoading = ref(false)

  function addTransaction(transaction) {
    transactions.value.push(transaction)
  }

  function addTransactions(newTransactions) {
    transactions.value.push(...newTransactions)
  }

  function setTransactions(newTransactions) {
    transactions.value = newTransactions
  }

  function updateTransaction(updatedTransaction) {
    const index = transactions.value.findIndex(t => t.id === updatedTransaction.id);
    if (index !== -1) {
      transactions.value[index] = updatedTransaction;
    }
  }

  function removeTransaction(transactionId) {
    transactions.value = transactions.value.filter(t => t.id !== transactionId)
  }

  return { transactions, addTransaction, addTransactions, setTransactions, updateTransaction, removeTransaction, isLoading }
});