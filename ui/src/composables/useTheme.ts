import { ref, onMounted, watch } from 'vue'

const THEME_KEY = 'gullak-theme'
const AVAILABLE_THEMES = ['light', 'dark', 'winter', 'lemonade', 'nord'] as const

type Theme = typeof AVAILABLE_THEMES[number]

export function useTheme() {
  const currentTheme = ref<Theme>('light')

  const setTheme = (theme: Theme) => {
    currentTheme.value = theme
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }

  const toggleTheme = () => {
    // Cycle through themes
    const currentIndex = AVAILABLE_THEMES.indexOf(currentTheme.value)
    const nextIndex = (currentIndex + 1) % AVAILABLE_THEMES.length
    setTheme(AVAILABLE_THEMES[nextIndex])
  }

  const initTheme = () => {
    const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null
    const theme = savedTheme || 'light'
    setTheme(theme)
  }

  onMounted(() => {
    initTheme()
  })

  watch(currentTheme, (newTheme) => {
    document.documentElement.setAttribute('data-theme', newTheme)
  })

  return {
    currentTheme,
    setTheme,
    toggleTheme,
    themes: AVAILABLE_THEMES,
  }
}
