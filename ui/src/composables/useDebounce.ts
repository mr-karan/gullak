import { ref, watch } from 'vue'

export function useDebounce<T>(value: T, delay: number = 300) {
  const debouncedValue = ref<T>(value)

  let timeoutId: number | null = null

  watch(
    () => value,
    (newValue) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = window.setTimeout(() => {
        debouncedValue.value = newValue
      }, delay)
    },
    { immediate: true }
  )

  return debouncedValue
}