export interface Transaction {
  id: number
  created_at: string
  transaction_date: string
  currency: string
  amount: number
  category: string
  description: string
  confirm: boolean
}

export interface ExpenseInput {
  line: string
}

export interface ApiResponse<T = any> {
  message?: string
  error?: string
  data: T
}

export interface CategorySummary {
  category: string
  total_spent: number
}

export interface DailySpendingSummary {
  transaction_date: string
  total_spent: number
}

export interface TransactionFilters {
  confirm?: boolean
  start_date?: string
  end_date?: string
}

export interface DashboardStats {
  total_expenses: number
  transaction_count: number
  category_count: number
}

export interface Settings {
  currency: string
  timezone: string
}

export interface UpdateSettingsRequest {
  currency: string
  timezone: string
}

export interface FileUploadResponse {
  message: string
  data: Transaction[]
}