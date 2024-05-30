import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const API_BASE_URL = '/api/transactions'

export const useTransactionStore = defineStore('transaction', () => {
  const transactions = ref([])
  const isLoading = ref(false)

  // Computed property to check for unconfirmed transactions
  const hasUnconfirmedTransactions = computed(() => {
    return transactions.value.some((transaction) => !transaction.confirmed)
  })

  async function fetchUnconfirmedTransactions() {
    isLoading.value = true
    try {
      const response = await axios.get(`${API_BASE_URL}?confirm=false`)
      transactions.value = response.data.data
    } finally {
      isLoading.value = false
    }
  }

  async function fetchConfirmedTransactions() {
    isLoading.value = true
    try {
      const response = await axios.get(`${API_BASE_URL}?confirm=true`)
      transactions.value = response.data.data
    } finally {
      isLoading.value = false
    }
  }

  async function createTransaction(line) {
    isLoading.value = true
    try {
      const response = await axios.post(API_BASE_URL, { line, confirm: false })
      transactions.value.push(...response.data.data)
    } finally {
      isLoading.value = false
    }
  }

  async function deleteTransaction(transactionId) {
    await axios.delete(`${API_BASE_URL}/${transactionId}`)
    transactions.value = transactions.value.filter((t) => t.id !== transactionId)
  }

  async function updateTransaction(transaction) {
    await axios.put(`${API_BASE_URL}/${transaction.id}`, transaction)
    const index = transactions.value.findIndex((t) => t.id === transaction.id)
    if (index !== -1) {
      transactions.value.splice(index, 1, transaction)
    }
  }

  return {
    transactions,
    isLoading,
    hasUnconfirmedTransactions,
    fetchUnconfirmedTransactions,
    fetchConfirmedTransactions,
    createTransaction,
    deleteTransaction,
    updateTransaction
  }
})
