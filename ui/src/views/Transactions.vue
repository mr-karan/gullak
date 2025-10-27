<template>
  <div class="min-h-screen bg-base-200">
    <!-- Header -->
    <div class="bg-base-100 shadow-sm sticky top-0 z-40">
      <div class="container mx-auto px-4">
        <div class="navbar">
          <div class="navbar-start">
            <h1 class="text-xl sm:text-2xl font-bold text-primary flex items-center gap-2">
              <svg class="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 2H7C5.9 2 5 2.9 5 4V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V4C19 2.9 18.1 2 17 2M17 20H7V4H17V20M12 5.5C13.24 5.5 14.25 6.51 14.25 7.75S13.24 10 12 10 9.75 8.99 9.75 7.75 10.76 5.5 12 5.5M16.5 16.75H7.5V15.5C7.5 13.92 10.33 13 12 13S16.5 13.92 16.5 15.5V16.75Z"/>
              </svg>
              Gullak
            </h1>
          </div>
          <div class="navbar-center hidden sm:flex">
            <h2 class="text-sm font-semibold text-base-content/70">Expense Logger</h2>
          </div>
          <div class="navbar-end gap-2">
            <router-link to="/settings" class="btn btn-ghost btn-sm btn-circle">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </router-link>
            <button class="btn btn-primary btn-sm sm:btn-md gap-2" @click="showExpenseModal = true">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
              </svg>
              <span class="hidden sm:inline">Add Expense</span>
            </button>
          </div>
        </div>
      </div>
    </div>


    <div class="container mx-auto p-4 space-y-6">

    <!-- Loading/Error States -->
    <div v-if="loading" class="flex justify-center my-8">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

     <div v-else-if="error" class="alert alert-error mb-6">
       <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
       </svg>
       <div>
         <h3 class="font-bold">Error Loading Transactions</h3>
         <div class="text-xs">{{ error }}</div>
       </div>
       <div class="flex-none">
         <button class="btn btn-sm btn-ghost" @click="loadFilteredTransactions()" :disabled="loading">
           <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
             <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
             <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
           {{ loading ? 'Retrying...' : 'Retry' }}
         </button>
       </div>
     </div>

      <!-- Filters Section -->
      <div v-else class="card bg-base-100 shadow-sm">
        <div class="card-body p-3">
          <div class="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <!-- Search Bar -->
            <div class="flex-1 w-full sm:max-w-sm">
              <input
                type="text"
                v-model="filters.search"
                placeholder="Search..."
                class="input input-bordered input-sm w-full"
              />
            </div>

            <!-- Quick Filters -->
            <div class="flex flex-wrap gap-2 w-full sm:w-auto">
              <select v-model="filters.category" class="select select-bordered select-sm">
                <option value="">All Categories</option>
                <option v-for="category in categories" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>

              <select v-model="quickDateFilter" @change="applyQuickDateFilter" class="select select-bordered select-sm">
                <option value="">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="3months">Last 3 Months</option>
              </select>

              <button
                @click="showAdvancedFilters = !showAdvancedFilters"
                class="btn btn-outline btn-sm"
                :class="{ 'btn-active': showAdvancedFilters }"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Advanced Filters -->
          <div v-if="showAdvancedFilters" class="mt-3 pt-3 border-t border-base-200">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="date"
                v-model="filters.dateFrom"
                placeholder="Date From"
                class="input input-bordered input-sm"
              />
              <input
                type="date"
                v-model="filters.dateTo"
                placeholder="Date To"
                class="input input-bordered input-sm"
              />
              <input
                type="number"
                v-model="filters.amountMin"
                placeholder="Min Amount"
                min="0"
                step="0.01"
                class="input input-bordered input-sm"
              />
              <input
                type="number"
                v-model="filters.amountMax"
                placeholder="Max Amount"
                min="0"
                step="0.01"
                class="input input-bordered input-sm"
              />
            </div>
          </div>

          <div class="flex justify-between items-center mt-3 pt-3 border-t border-base-200">
            <div class="text-xs opacity-60">
              {{ filteredTransactions.length }} / {{ transactions.length }}
            </div>
            <div class="flex gap-2">
              <button v-if="hasActiveFilters" @click="clearFilters" class="btn btn-ghost btn-xs">
                Clear
              </button>
              <button
                @click="exportCSV"
                class="btn btn-outline btn-xs gap-1"
                :disabled="filteredTransactions.length === 0"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bulk Actions Bar -->
      <div v-if="selectedTransactions.length > 0" class="card bg-primary/10 border border-primary shadow-sm">
        <div class="card-body p-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ selectedTransactions.length }} selected</span>
              <button @click="clearSelection" class="btn btn-ghost btn-xs">Clear</button>
            </div>
            <div class="flex gap-2">
              <button @click="showBulkEditModal = true" class="btn btn-primary btn-xs" :disabled="isBulkEditing">
                Edit
              </button>
              <button @click="bulkConfirm" class="btn btn-success btn-xs" :disabled="isBulkConfirming">
                {{ isBulkConfirming ? 'Confirming...' : 'Confirm' }}
              </button>
              <button @click="showBulkDeleteModal = true" class="btn btn-error btn-xs" :disabled="isBulkDeleting">
                {{ isBulkDeleting ? 'Deleting...' : 'Delete' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Transactions Table -->
      <div v-if="!loading && !error" class="card bg-base-100 shadow-sm">
        <div class="overflow-x-auto">
          <table class="table table-xs table-pin-rows">
            <thead>
              <tr>
                <th class="w-8">
                  <input
                    type="checkbox"
                    :checked="isAllSelected"
                    @change="toggleSelectAll"
                    class="checkbox checkbox-xs"
                  />
                </th>
                <th @click="sortBy('transaction_date')" class="cursor-pointer hover:bg-base-200">
                  Date {{ getSortIcon('transaction_date') }}
                </th>
                <th @click="sortBy('description')" class="cursor-pointer hover:bg-base-200">
                  Description {{ getSortIcon('description') }}
                </th>
                <th @click="sortBy('category')" class="cursor-pointer hover:bg-base-200">
                  Category {{ getSortIcon('category') }}
                </th>
                <th @click="sortBy('amount')" class="cursor-pointer hover:bg-base-200 text-right">
                  Amount {{ getSortIcon('amount') }}
                </th>
                <th class="text-center">✓</th>
                <th class="w-8"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredTransactions.length === 0">
                <td colspan="7" class="text-center py-8 text-base-content/60">
                  No transactions found
                </td>
              </tr>
              <tr v-for="transaction in filteredTransactions" :key="transaction.id" class="hover">
                <td>
                  <input
                    type="checkbox"
                    :checked="isSelected(transaction.id)"
                    @change="toggleSelection(transaction.id)"
                    class="checkbox checkbox-xs"
                  />
                </td>
                <td class="whitespace-nowrap">{{ formatDate(transaction.transaction_date) }}</td>
                <td class="max-w-xs truncate">{{ transaction.description }}</td>
                <td class="capitalize">{{ transaction.category }}</td>
                <td class="font-semibold text-right whitespace-nowrap">{{ formatCurrency(transaction.amount, transaction.currency) }}</td>
                <td class="text-center">
                  <input
                    type="checkbox"
                    :checked="transaction.confirm"
                    @change="toggleConfirmTransaction(transaction)"
                    class="checkbox checkbox-xs"
                    :class="transaction.confirm ? 'checkbox-success' : 'checkbox-warning'"
                  />
                </td>
                <td>
                  <div class="dropdown dropdown-left dropdown-end">
                    <label tabindex="0" class="btn btn-ghost btn-xs">⋮</label>
                    <ul tabindex="0" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-40 text-sm">
                      <li><a @click="editTransaction(transaction)">Edit</a></li>
                      <li><a class="text-error" @click="deleteTransaction(transaction.id)">Delete</a></li>
                    </ul>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Expense Modal -->
    <div class="modal" :class="{ 'modal-open': showExpenseModal }">
      <div class="modal-box max-w-lg">
        <h3 class="font-bold text-base mb-3">Add Expense</h3>
        <form @submit.prevent="addExpense">
          <textarea
            v-model="newExpense.description"
            placeholder="e.g., Spent ₹500 on groceries"
            class="textarea textarea-bordered w-full h-20 text-sm"
            required
            :disabled="isSubmitting"
          ></textarea>
          <p class="text-xs text-base-content/60 mt-1">AI will parse amount, category, and currency</p>

          <div class="modal-action mt-3">
            <button type="button" class="btn btn-ghost btn-sm" @click="showExpenseModal = false" :disabled="isSubmitting">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="isSubmitting">
              <span v-if="isSubmitting" class="loading loading-spinner loading-xs"></span>
              {{ isSubmitting ? 'Adding...' : 'Add' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Confirm Delete Modal -->
    <div class="modal" :class="{ 'modal-open': showDeleteModal }">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-base">Confirm Delete</h3>
        <p class="py-3 text-sm">Delete this transaction?</p>
        <p class="text-xs opacity-60 truncate">{{ transactionToDelete?.description }}</p>

        <div class="modal-action mt-3">
          <button type="button" class="btn btn-ghost btn-sm" @click="showDeleteModal = false">Cancel</button>
          <button type="button" class="btn btn-error btn-sm" @click="confirmDelete" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting...' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bulk Delete Modal -->
    <div class="modal" :class="{ 'modal-open': showBulkDeleteModal }">
      <div class="modal-box max-w-sm">
        <h3 class="font-bold text-base">Confirm Bulk Delete</h3>
        <p class="py-3 text-sm">Delete {{ selectedTransactions.length }} transactions?</p>
        <p class="text-xs opacity-60">This cannot be undone.</p>

        <div class="modal-action mt-3">
          <button type="button" class="btn btn-ghost btn-sm" @click="showBulkDeleteModal = false">Cancel</button>
          <button type="button" class="btn btn-error btn-sm" @click="confirmBulkDelete" :disabled="isBulkDeleting">
            {{ isBulkDeleting ? 'Deleting...' : 'Delete All' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Transaction Modal -->
    <div class="modal" :class="{ 'modal-open': showEditModal }">
      <div class="modal-box max-w-lg">
        <h3 class="font-bold text-base mb-3">Edit Transaction</h3>
        <form @submit.prevent="saveEdit" class="space-y-3">
          <textarea
            v-model="editForm.description"
            class="textarea textarea-bordered textarea-sm w-full h-16"
            required
            :disabled="isEditing"
          ></textarea>

          <div class="grid grid-cols-2 gap-2">
            <input
              type="number"
              v-model="editForm.amount"
              step="0.01"
              min="0"
              placeholder="Amount"
              class="input input-bordered input-sm"
              required
              :disabled="isEditing"
            />
            <select v-model="editForm.currency" class="select select-bordered select-sm" :disabled="isEditing">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <select v-model="editForm.category" class="select select-bordered select-sm" :disabled="isEditing">
              <option v-for="category in categories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
            <input
              type="date"
              v-model="editForm.transaction_date"
              class="input input-bordered input-sm"
              required
              :disabled="isEditing"
            />
          </div>

          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              v-model="editForm.confirm"
              class="checkbox checkbox-xs"
              :disabled="isEditing"
            />
            <span class="text-sm">Confirmed</span>
          </label>

          <div class="modal-action mt-3">
            <button type="button" class="btn btn-ghost btn-sm" @click="showEditModal = false" :disabled="isEditing">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="isEditing">
              <span v-if="isEditing" class="loading loading-spinner loading-xs"></span>
              {{ isEditing ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Bulk Edit Modal -->
    <div class="modal" :class="{ 'modal-open': showBulkEditModal }">
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-base mb-2">Bulk Edit</h3>
        <p class="text-xs opacity-60 mb-3">Apply to {{ selectedTransactions.length }} transactions</p>
        <form @submit.prevent="saveBulkEdit" class="space-y-3">
          <select v-model="bulkEditForm.category" class="select select-bordered select-sm w-full" :disabled="isBulkEditing">
            <option value="">Keep current category</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>

          <select v-model="bulkEditForm.confirm" class="select select-bordered select-sm w-full" :disabled="isBulkEditing">
            <option :value="null">Keep current status</option>
            <option :value="true">Mark as Confirmed</option>
            <option :value="false">Mark as Pending</option>
          </select>

          <div class="modal-action mt-3">
            <button type="button" class="btn btn-ghost btn-sm" @click="showBulkEditModal = false" :disabled="isBulkEditing">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-sm" :disabled="isBulkEditing || (!bulkEditForm.category && bulkEditForm.confirm === null)">
              <span v-if="isBulkEditing" class="loading loading-spinner loading-xs"></span>
              {{ isBulkEditing ? 'Updating...' : 'Apply' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTransactions } from '@/composables/useTransactions'
import { useDebounce } from '@/composables/useDebounce'
import { useExport } from '@/composables/useExport'
import { useNotifications } from '@/composables/useNotifications'
import type { Transaction } from '@/types/api'

const showExpenseModal = ref(false)
const showDeleteModal = ref(false)
const showBulkDeleteModal = ref(false)
const showEditModal = ref(false)
const showBulkEditModal = ref(false)
const showAdvancedFilters = ref(false)
const isSubmitting = ref(false)
const isDeleting = ref(false)
const isBulkConfirming = ref(false)
const isBulkDeleting = ref(false)
const isEditing = ref(false)
const isBulkEditing = ref(false)
const transactionToDelete = ref<Transaction | null>(null)
const transactionToEdit = ref<Transaction | null>(null)
const selectedTransactionIds = ref<number[]>([])
const quickDateFilter = ref('')

const filters = ref({
  search: '',
  category: '',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: ''
})

const debouncedSearch = useDebounce(filters.value.search, 500)

const sortConfig = ref({
  key: 'transaction_date',
  direction: 'desc' as 'asc' | 'desc'
})

const newExpense = ref({
  description: ''
})

const editForm = ref({
  description: '',
  amount: '',
  currency: '',
  category: '',
  transaction_date: '',
  confirm: false
})

const bulkEditForm = ref({
  category: '',
  confirm: null as boolean | null
})

const {
  transactions,
  loading,
  error,
  categories,
  loadTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction: deleteTransactionApi,
  getCategoryColor,
  getContrastColor
} = useTransactions()

const { exportToCSV } = useExport()
const { success, error: showError } = useNotifications()

// Watch for filter changes and reload transactions
watch(filters, () => {
  loadFilteredTransactions()
}, { deep: true })

const filteredTransactions = computed(() => {
  let filtered = transactions.value.filter(transaction => {
    const matchesSearch = !debouncedSearch.value ||
      transaction.description.toLowerCase().includes(debouncedSearch.value.toLowerCase())

    const matchesCategory = !filters.value.category ||
      transaction.category === filters.value.category

    // Extract date part from transaction_date for comparison
    const transactionDate = transaction.transaction_date.split('T')[0]

    const matchesDateFrom = !filters.value.dateFrom ||
      transactionDate >= filters.value.dateFrom

    const matchesDateTo = !filters.value.dateTo ||
      transactionDate <= filters.value.dateTo

    const matchesAmountMin = !filters.value.amountMin ||
      transaction.amount >= parseFloat(filters.value.amountMin)

    const matchesAmountMax = !filters.value.amountMax ||
      transaction.amount <= parseFloat(filters.value.amountMax)

    return matchesSearch && matchesCategory && matchesDateFrom && matchesDateTo && matchesAmountMin && matchesAmountMax
  })

  // Apply sorting
  filtered.sort((a, b) => {
    let aValue: any = a[sortConfig.value.key as keyof Transaction]
    let bValue: any = b[sortConfig.value.key as keyof Transaction]

    // Handle date sorting
    if (sortConfig.value.key === 'transaction_date') {
      aValue = new Date(aValue).getTime()
      bValue = new Date(bValue).getTime()
    }

    if (aValue < bValue) {
      return sortConfig.value.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.value.direction === 'asc' ? 1 : -1
    }
    return 0
  })

  return filtered
})

const hasActiveFilters = computed(() => {
  return filters.value.search || filters.value.category || filters.value.dateFrom || filters.value.dateTo || filters.value.amountMin || filters.value.amountMax
})

const selectedTransactions = computed(() => {
  return transactions.value.filter(t => selectedTransactionIds.value.includes(t.id))
})

const isAllSelected = computed(() => {
  return filteredTransactions.value.length > 0 &&
         selectedTransactionIds.value.length === filteredTransactions.value.length
})

const isSelected = (id: number) => {
  return selectedTransactionIds.value.includes(id)
}

const loadFilteredTransactions = () => {
  const apiFilters = {
    start_date: filters.value.dateFrom || undefined,
    end_date: filters.value.dateTo || undefined,
  }
  loadTransactions(apiFilters)
  // Clear selection when filters change
  clearSelection()
}

const formatCurrency = (amount: number, currency: string = 'INR') => {
  // Ensure currency is valid, default to INR if not
  const validCurrency = currency && currency.trim() ? currency.trim().toUpperCase() : 'INR'
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: validCurrency
    }).format(amount)
  } catch (error) {
    // Fallback to INR if currency is invalid
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount)
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString()
}

const addExpense = async () => {
  if (!newExpense.value.description.trim()) return

  isSubmitting.value = true
  try {
    await createTransaction(newExpense.value.description)
    newExpense.value.description = ''
    showExpenseModal.value = false
    loadFilteredTransactions() // Refresh the list
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isSubmitting.value = false
  }
}

const toggleConfirmTransaction = async (transaction: Transaction) => {
  try {
    await updateTransaction(transaction.id, { confirm: !transaction.confirm })
  } catch (error) {
    // Error is handled by the composable
  }
}

const editTransaction = (transaction: Transaction) => {
  transactionToEdit.value = transaction
  editForm.value = {
    description: transaction.description,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    category: transaction.category,
    transaction_date: transaction.transaction_date.split('T')[0], // Extract date part
    confirm: transaction.confirm
  }
  showEditModal.value = true
}

const deleteTransaction = (id: number) => {
  const transaction = transactions.value.find(t => t.id === id)
  if (transaction) {
    transactionToDelete.value = transaction
    showDeleteModal.value = true
  }
}

const confirmDelete = async () => {
  if (!transactionToDelete.value) return

  isDeleting.value = true
  try {
    await deleteTransactionApi(transactionToDelete.value.id)
    showDeleteModal.value = false
    transactionToDelete.value = null
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isDeleting.value = false
  }
}

const toggleSelection = (id: number) => {
  const index = selectedTransactionIds.value.indexOf(id)
  if (index > -1) {
    selectedTransactionIds.value.splice(index, 1)
  } else {
    selectedTransactionIds.value.push(id)
  }
}

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    // Deselect all filtered transactions
    selectedTransactionIds.value = selectedTransactionIds.value.filter(
      id => !filteredTransactions.value.some(t => t.id === id)
    )
  } else {
    // Select all filtered transactions
    const filteredIds = filteredTransactions.value.map(t => t.id)
    selectedTransactionIds.value = [...new Set([...selectedTransactionIds.value, ...filteredIds])]
  }
}

const clearSelection = () => {
  selectedTransactionIds.value = []
}

const bulkConfirm = async () => {
  if (selectedTransactions.value.length === 0) return

  isBulkConfirming.value = true
  try {
    // Process updates sequentially to avoid SQLite locking
    for (const transaction of selectedTransactions.value) {
      await updateTransaction(transaction.id, { confirm: true })
    }
    clearSelection()
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isBulkConfirming.value = false
  }
}

const confirmBulkDelete = async () => {
  if (selectedTransactions.value.length === 0) return

  isBulkDeleting.value = true
  try {
    // Process deletions sequentially to avoid SQLite locking
    for (const transaction of selectedTransactions.value) {
      await deleteTransactionApi(transaction.id)
    }
    showBulkDeleteModal.value = false
    clearSelection()
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isBulkDeleting.value = false
  }
}

const clearFilters = () => {
  filters.value = {
    search: '',
    category: '',
    dateFrom: '',
    dateTo: '',
    amountMin: '',
    amountMax: ''
  }
}

const exportCSV = () => {
  if (filteredTransactions.value.length === 0) {
    return
  }
  exportToCSV(filteredTransactions.value, 'gullak_transactions')
  success(`Exported ${filteredTransactions.value.length} transactions to CSV`)
}

const applyQuickDateFilter = () => {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  switch (quickDateFilter.value) {
    case 'today': {
      filters.value.dateFrom = today
      filters.value.dateTo = today
      break
    }
    case 'week': {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      filters.value.dateFrom = weekAgo.toISOString().split('T')[0]
      filters.value.dateTo = today
      break
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      filters.value.dateFrom = monthStart.toISOString().split('T')[0]
      filters.value.dateTo = today
      break
    }
    case '3months': {
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      filters.value.dateFrom = threeMonthsAgo.toISOString().split('T')[0]
      filters.value.dateTo = today
      break
    }
    default: {
      filters.value.dateFrom = ''
      filters.value.dateTo = ''
    }
  }
}

const saveEdit = async () => {
  if (!transactionToEdit.value) return

  isEditing.value = true
  try {
    await updateTransaction(transactionToEdit.value.id, {
      description: editForm.value.description,
      amount: parseFloat(editForm.value.amount),
      currency: editForm.value.currency,
      category: editForm.value.category,
      transaction_date: editForm.value.transaction_date,
      confirm: editForm.value.confirm
    })
    showEditModal.value = false
    transactionToEdit.value = null
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isEditing.value = false
  }
}

const saveBulkEdit = async () => {
  if (selectedTransactions.value.length === 0) return

  isBulkEditing.value = true
  try {
    const updates: Partial<Transaction> = {}
    if (bulkEditForm.value.category) {
      updates.category = bulkEditForm.value.category
    }
    if (bulkEditForm.value.confirm !== null) {
      updates.confirm = bulkEditForm.value.confirm
    }

    // Process updates sequentially to avoid SQLite locking
    for (const transaction of selectedTransactions.value) {
      await updateTransaction(transaction.id, updates)
    }

    showBulkEditModal.value = false
    bulkEditForm.value = { category: '', confirm: null }
    clearSelection()
  } catch (error) {
    // Error is handled by the composable
  } finally {
    isBulkEditing.value = false
  }
}

const sortBy = (key: string) => {
  if (sortConfig.value.key === key) {
    // Toggle direction if same key
    sortConfig.value.direction = sortConfig.value.direction === 'asc' ? 'desc' : 'asc'
  } else {
    // New key, default to desc for dates, asc for others
    sortConfig.value.key = key
    sortConfig.value.direction = key === 'transaction_date' ? 'desc' : 'asc'
  }
}

const getSortIcon = (key: string) => {
  if (sortConfig.value.key !== key) return '↕️'
  return sortConfig.value.direction === 'asc' ? '↑' : '↓'
}

// Load initial data
loadFilteredTransactions()
</script>