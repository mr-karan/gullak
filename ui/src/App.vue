<template>
  <div id="app" class="min-h-screen bg-base-200">
    <!-- Online Status Indicator -->
    <div
      v-if="!isOnline"
      class="fixed top-0 left-0 right-0 z-50 bg-error text-error-content px-4 py-2 text-center text-sm font-medium"
    >
      <div class="flex items-center justify-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        You're offline. Some features may not work.
      </div>
    </div>

    <div :class="{ 'pt-12': !isOnline }">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()
</script>