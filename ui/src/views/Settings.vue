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
            <h2 class="text-sm font-semibold text-base-content/70">Settings</h2>
          </div>
          <div class="navbar-end gap-2">
            <div class="dropdown dropdown-end">
              <button tabindex="0" class="btn btn-ghost btn-sm btn-circle" title="Change Theme">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </button>
              <ul tabindex="0" class="dropdown-content z-50 menu p-2 shadow bg-base-100 rounded-box w-36">
                <li v-for="theme in themes" :key="theme">
                  <a @click="setTheme(theme)" :class="{ 'active': currentTheme === theme }">
                    {{ theme.charAt(0).toUpperCase() + theme.slice(1) }}
                  </a>
                </li>
              </ul>
            </div>
            <router-link to="/" class="btn btn-ghost btn-sm">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </router-link>
          </div>
        </div>
      </div>
    </div>


    <div class="container mx-auto p-4 space-y-6 max-w-2xl">
      <!-- Loading State -->
      <div v-if="loading" class="flex justify-center my-8">
        <span class="loading loading-spinner loading-lg"></span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="alert alert-error shadow-sm">
        <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>{{ error }}</span>
      </div>

      <!-- Settings Form -->
      <div v-else class="card bg-base-100 shadow-sm">
        <div class="card-body p-6">
          <h2 class="card-title text-xl mb-6">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Preferences
          </h2>

          <form @submit.prevent="saveSettings" class="space-y-6">
            <!-- Currency Selection -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">Preferred Currency</span>
                <span class="label-text-alt text-xs">Used for calculations and reports</span>
              </label>
              <select v-model="form.currency" class="select select-bordered" required>
                <option value="">Select currency</option>
                <option value="INR">🇮🇳 Indian Rupee (INR)</option>
                <option value="USD">🇺🇸 US Dollar (USD)</option>
                <option value="EUR">🇪🇺 Euro (EUR)</option>
                <option value="GBP">🇬🇧 British Pound (GBP)</option>
                <option value="JPY">🇯🇵 Japanese Yen (JPY)</option>
                <option value="AUD">🇦🇺 Australian Dollar (AUD)</option>
                <option value="CAD">🇨🇦 Canadian Dollar (CAD)</option>
                <option value="SGD">🇸🇬 Singapore Dollar (SGD)</option>
                <option value="AED">🇦🇪 UAE Dirham (AED)</option>
              </select>
              <label class="label">
                <span class="label-text-alt">Dashboard stats and reports will only include transactions in this currency</span>
              </label>
            </div>

            <!-- Timezone Selection -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-medium">Timezone</span>
                <span class="label-text-alt text-xs">For accurate date/time tracking</span>
              </label>
              <select v-model="form.timezone" class="select select-bordered" required>
                <option value="">Select timezone</option>
                <optgroup label="Asia">
                  <option value="Asia/Kolkata">India (Kolkata)</option>
                  <option value="Asia/Dubai">UAE (Dubai)</option>
                  <option value="Asia/Singapore">Singapore</option>
                  <option value="Asia/Tokyo">Japan (Tokyo)</option>
                  <option value="Asia/Hong_Kong">Hong Kong</option>
                </optgroup>
                <optgroup label="Europe">
                  <option value="Europe/London">UK (London)</option>
                  <option value="Europe/Paris">France (Paris)</option>
                  <option value="Europe/Berlin">Germany (Berlin)</option>
                </optgroup>
                <optgroup label="Americas">
                  <option value="America/New_York">USA East (New York)</option>
                  <option value="America/Chicago">USA Central (Chicago)</option>
                  <option value="America/Los_Angeles">USA West (Los Angeles)</option>
                  <option value="America/Toronto">Canada (Toronto)</option>
                </optgroup>
                <optgroup label="Pacific">
                  <option value="Australia/Sydney">Australia (Sydney)</option>
                  <option value="Pacific/Auckland">New Zealand (Auckland)</option>
                </optgroup>
              </select>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3 justify-end pt-4 border-t border-base-200">
              <router-link to="/" class="btn btn-ghost">Cancel</router-link>
              <button type="submit" class="btn btn-primary" :disabled="saving || !hasChanges">
                <span v-if="saving" class="loading loading-spinner loading-sm"></span>
                {{ saving ? 'Saving...' : 'Save Settings' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Info Card -->
      <div class="alert alert-info shadow-sm">
        <svg class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div class="text-sm">
          <p class="font-medium">Household Finance Management</p>
          <p class="text-xs opacity-80 mt-1">Set your preferred currency and timezone for accurate tracking. All family members should use the same currency preference for consistent reports.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { apiService } from '@/services/api'
import { useNotifications } from '@/composables/useNotifications'
import { useTheme } from '@/composables/useTheme'
import type { Settings } from '@/types/api'

// Theme
const { currentTheme, setTheme, themes } = useTheme()

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const { success, error: showError } = useNotifications()

const originalSettings = ref<Settings>({ currency: 'INR', timezone: 'Asia/Kolkata' })
const form = ref<Settings>({ currency: 'INR', timezone: 'Asia/Kolkata' })

const hasChanges = computed(() => {
  return form.value.currency !== originalSettings.value.currency ||
         form.value.timezone !== originalSettings.value.timezone
})

const loadSettings = async () => {
  loading.value = true
  error.value = null

  try {
    const settings = await apiService.getSettings()
    originalSettings.value = { ...settings }
    form.value = { ...settings }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load settings'
    console.error('Error loading settings:', err)
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  if (!hasChanges.value) return

  saving.value = true
  error.value = null

  try {
    await apiService.updateSettings(form.value)
    originalSettings.value = { ...form.value }
    success('Settings saved successfully!')
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to save settings'
    error.value = errorMsg
    showError(errorMsg)
    console.error('Error saving settings:', err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>
