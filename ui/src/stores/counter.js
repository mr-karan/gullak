import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTransactionStore = defineStore('transaction', () => {
  const transactions = ref([])

  function addTransaction(transaction) {
    transactions.value.push(transaction)
  }

  return { transactions, addTransaction }
});
