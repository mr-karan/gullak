import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const TRANSACTIONS_BASE_URL = '/api/transactions'
const REPORTS_BASE_URL = '/api/reports'

export const useTransactionStore = defineStore('transaction', () => {
  const isLoading = ref(false)

  async function fetchTransactions(confirmed = true, startDate = null, endDate = null) {
    isLoading.value = true
    try {
      const params = { confirm: confirmed }
      if (startDate && startDate.trim() !== '') {
        params.start_date = startDate
      }
      if (endDate && endDate.trim() !== '') {
        params.end_date = endDate
      }
      const response = await axios.get(TRANSACTIONS_BASE_URL, { params })
      return response.data.data
    } finally {
      isLoading.value = false
    }
  }

  async function createTransaction(line) {
    isLoading.value = true
    try {
      await axios.post(TRANSACTIONS_BASE_URL, { line, confirm: false })
    } finally {
      isLoading.value = false;
    }
  }

  async function deleteTransaction(transactionId) {
    isLoading.value = true
    try {
      await axios.delete(`${TRANSACTIONS_BASE_URL}/${transactionId}`)
    } finally {
      isLoading.value = false
    }
  }

  async function updateTransaction(transaction) {
    isLoading.value = true
    try {
      await axios.put(`${TRANSACTIONS_BASE_URL}/${transaction.id}`, transaction)
    } finally {
      isLoading.value = false
    }
  }

  async function fetchTopExpenseCategories(startDate, endDate) {
    isLoading.value = true;
    try {
      const response = await axios.get(`${REPORTS_BASE_URL}/top-expense-categories`, {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      });
      return response.data.data;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchDailySpending(startDate, endDate) {
    isLoading.value = true;
    try {
      const response = await axios.get(`${REPORTS_BASE_URL}/daily-spending`, {
        params: { start_date: startDate, end_date: endDate },
      });
      return response.data.data;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    isLoading,
    fetchTransactions,
    createTransaction,
    deleteTransaction,
    updateTransaction,
    fetchTopExpenseCategories,
    fetchDailySpending
  }
})
