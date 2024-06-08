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

// utils.js

/**
 * Formats a JavaScript Date object into a string in YYYY-MM-DD format.
 * @param {Date} date - The Date object to format.
 * @return {string} The formatted date string.
 */
export function formatDateV2(date) {
  if (!(date instanceof Date)) {
    throw new Error("Provided value is not a valid Date object.");
  }

  let month = '' + (date.getMonth() + 1),
    day = '' + date.getDate(),
    year = date.getFullYear();

  if (month.length < 2)
    month = '0' + month;
  if (day.length < 2)
    day = '0' + day;

  return [year, month, day].join('-');
}
