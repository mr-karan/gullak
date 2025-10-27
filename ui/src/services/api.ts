import type {
  Transaction,
  ExpenseInput,
  ApiResponse,
  CategorySummary,
  DailySpendingSummary,
  TransactionFilters,
  DashboardStats,
  Settings,
  UpdateSettingsRequest
} from '@/types/api'

const API_BASE = '/api'

class ApiService {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${API_BASE}${endpoint}`

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // Create a new transaction from natural language input
  async createTransaction(input: ExpenseInput): Promise<Transaction[]> {
    const response = await this.request<Transaction[]>('/transactions', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return response.data
  }

  // List transactions with optional filters
  async listTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
    const params = new URLSearchParams()

    if (filters.confirm !== undefined) {
      params.append('confirm', filters.confirm.toString())
    }
    if (filters.start_date) {
      params.append('start_date', filters.start_date)
    }
    if (filters.end_date) {
      params.append('end_date', filters.end_date)
    }

    const queryString = params.toString()
    const endpoint = `/transactions${queryString ? `?${queryString}` : ''}`

    const response = await this.request<Transaction[]>(endpoint)
    return response.data
  }

  // Get a specific transaction by ID
  async getTransaction(id: number): Promise<Transaction> {
    const response = await this.request<Transaction>(`/transactions/${id}`)
    return response.data
  }

  // Update a transaction
  async updateTransaction(id: number, transaction: Partial<Transaction>): Promise<void> {
    await this.request(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(transaction),
    })
  }

  // Delete a transaction
  async deleteTransaction(id: number): Promise<void> {
    await this.request(`/transactions/${id}`, {
      method: 'DELETE',
    })
  }

  // Get top expense categories (defaults to current month if no dates provided)
  async getTopExpenseCategories(startDate?: string, endDate?: string): Promise<CategorySummary[]> {
    const params = new URLSearchParams()

    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)

    const queryString = params.toString()
    const endpoint = `/reports/top-expense-categories${queryString ? `?${queryString}` : ''}`

    const response = await this.request<CategorySummary[]>(endpoint)
    return response.data
  }

  // Get daily spending summary
  async getDailySpending(startDate: string, endDate: string): Promise<DailySpendingSummary[]> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    })

    const response = await this.request<DailySpendingSummary[]>(`/reports/daily-spending?${params}`)
    return response.data
  }

  // Get dashboard statistics
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.request<DashboardStats>('/dashboard/stats')
    return response.data
  }

  // Get monthly spending by category for dashboard chart
  async getMonthlyCategorySpending(): Promise<CategorySummary[]> {
    return this.getTopExpenseCategories()
  }

  // Get user settings
  async getSettings(): Promise<Settings> {
    const response = await this.request<Settings>('/settings')
    return response.data
  }

  // Update user settings
  async updateSettings(settings: UpdateSettingsRequest): Promise<void> {
    await this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }
}

export const apiService = new ApiService()