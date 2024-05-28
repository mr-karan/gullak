import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0]
}

const categoryColors = {
  food: 'bg-green-500',
  entertainment: 'bg-blue-500',
  groceries: 'bg-yellow-500',
  travel: 'bg-purple-500',
  utilities: 'bg-red-500',
  shopping: 'bg-pink-500',
  health: 'bg-indigo-500',
  education: 'bg-teal-500'
}

export function getCategoryColor(category) {
  const lowerCaseCategory = category.toLowerCase()
  return categoryColors[lowerCaseCategory] || 'bg-gray-500' // default color if category is not found
}
