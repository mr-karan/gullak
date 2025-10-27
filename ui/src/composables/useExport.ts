import type { Transaction } from '@/types/api'

export function useExport() {
  const formatCurrency = (amount: number, currency: string = 'INR') => {
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency
      }).format(amount)
    } catch {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const exportToCSV = (transactions: Transaction[], filename: string = 'transactions') => {
    if (transactions.length === 0) return

    const headers = ['ID', 'Description', 'Amount', 'Currency', 'Category', 'Date', 'Status']
    const csvData = transactions.map(transaction => [
      transaction.id,
      transaction.description,
      transaction.amount,
      transaction.currency,
      transaction.category,
      formatDate(transaction.transaction_date),
      transaction.confirm ? 'Confirmed' : 'Pending'
    ])

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return {
    exportToCSV
  }
}