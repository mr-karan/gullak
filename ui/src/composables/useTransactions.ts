import { ref, computed } from 'vue'
import { apiService } from '@/services/api'
import { useNotifications } from '@/composables/useNotifications'
import type { Transaction, TransactionFilters } from '@/types/api'

// Minimal category color - just subtle gray variations
export const getCategoryColor = (category: string): string => {
  return '#e5e7eb' // Simple gray for all categories
}

// Always use dark text
export const getContrastColor = (bgColor: string): string => {
  return '#111827' // Dark gray text
}

export function useTransactions() {
  const transactions = ref<Transaction[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const { success, error: notifyError } = useNotifications()

  const categories = computed(() =>
    [...new Set(transactions.value.map(t => t.category))]
  )

  const loadTransactions = async (filters: TransactionFilters = {}) => {
    loading.value = true
    error.value = null

    try {
      // Ensure we load ALL transactions by default (no confirm filter)
      const apiFilters: TransactionFilters = {
        ...filters
      }
      // Only add confirm filter if explicitly set
      if (filters.confirm === undefined) {
        delete apiFilters.confirm
      }

      transactions.value = await apiService.listTransactions(apiFilters)
      console.log('Loaded transactions:', transactions.value.length)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load transactions'
      console.error('Error loading transactions:', err)
    } finally {
      loading.value = false
    }
  }

  const createTransaction = async (description: string) => {
    loading.value = true
    error.value = null

    try {
      const newTransactions = await apiService.createTransaction({ line: description })
      transactions.value.unshift(...newTransactions)
      success(`Added ${newTransactions.length} transaction${newTransactions.length > 1 ? 's' : ''}`)
      return newTransactions
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create transaction'
      notifyError(error.value)
      console.error('Error creating transaction:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const updateTransaction = async (id: number, updates: Partial<Transaction>) => {
    loading.value = true
    error.value = null

    try {
      await apiService.updateTransaction(id, updates)
      // Update local state
      const index = transactions.value.findIndex(t => t.id === id)
      if (index !== -1) {
        transactions.value[index] = { ...transactions.value[index], ...updates }
      }
      success('Transaction updated successfully')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update transaction'
      notifyError(error.value)
      console.error('Error updating transaction:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  const deleteTransaction = async (id: number) => {
    loading.value = true
    error.value = null

    try {
      await apiService.deleteTransaction(id)
      // Remove from local state
      transactions.value = transactions.value.filter(t => t.id !== id)
      success('Transaction deleted successfully')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete transaction'
      notifyError(error.value)
      console.error('Error deleting transaction:', err)
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    transactions,
    loading,
    error,
    categories,
    loadTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getCategoryColor,
    getContrastColor,
  }
}