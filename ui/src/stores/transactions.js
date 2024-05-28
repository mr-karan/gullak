// transactions.js
import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_BASE_URL = '/api/transactions'

export const useTransactionStore = defineStore('transaction', () => {
  const transactions = ref([])
  const isLoading = ref(false)

  async function fetchUnconfirmedTransactions() {
    const response = await axios.get(`${API_BASE_URL}?confirm=false`)
    transactions.value = response.data.data
  }

  async function fetchConfirmedTransactions() {
    const response = await axios.get(`${API_BASE_URL}?confirm=true`)
    transactions.value = response.data.data
  }

  async function createTransaction(line) {
    isLoading.value = true
    const response = await axios.post(API_BASE_URL, {
      line,
      confirm: false
    })
    transactions.value.push(...response.data.data)
    isLoading.value = false
  }

  async function confirmTransaction(transaction) {
    await axios.post(`${API_BASE_URL}/confirm`, { ...transaction, confirm: true })
    const index = transactions.value.findIndex((t) => t.id === transaction.id)
    if (index !== -1) {
      transactions.value.splice(index, 1)
    }
  }

  async function deleteTransaction(transactionId) {
    await axios.delete(`${API_BASE_URL}/${transactionId}`)
    transactions.value = transactions.value.filter((t) => t.id !== transactionId)
  }

  return {
    transactions,
    isLoading,
    fetchUnconfirmedTransactions,
    fetchConfirmedTransactions,
    createTransaction,
    confirmTransaction,
    deleteTransaction
  }
})
