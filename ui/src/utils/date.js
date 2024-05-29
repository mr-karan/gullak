export const parseDate = (dateString) => new Date(dateString)

// utils/date.js

/**
 * Formats a date string or object for display.
 * @param {Date|string} date - The date to format.
 * @returns {string} - The formatted date string.
 */
export function formatDateForDisplay(date) {
  if (!date) return ''
  const dateObj = new Date(date)
  return dateObj.toLocaleDateString('en-US', {
    day: '2-digit', // '2-digit' or 'numeric'
    month: 'long', // 'numeric', '2-digit', 'long', 'short', or 'narrow'
    year: 'numeric' // 'numeric' or '2-digit'
  })
}

/**
 * Formats a date object for API submission.
 * @param {Date} date - The date to format.
 * @returns {string} - The formatted date string in ISO format (YYYY-MM-DD).
 */
export function formatDateForApi(date) {
  if (!date) return ''
  return date.toISOString().split('T')[0]
}
