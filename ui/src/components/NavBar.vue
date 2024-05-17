<script setup></script>

<template>
  <header class="bg-white border-b border-gray-200 py-4">
    <div class="container mx-auto flex justify-between items-center">
      <div class="flex items-center">
        <div class="font-bold text-lg">Money Manager</div>
      </div>
      <nav class="flex items-center space-x-6">
        <router-link to="/transactions" class="text-gray-600 hover:text-gray-900"
          >Transactions</router-link
        >
        <router-link to="/reports" class="text-gray-600 hover:text-gray-900">Reports</router-link>
        <router-link to="/" class="bg-yellow-400 text-white px-4 py-2 rounded-md">Add</router-link>
      </nav>
    </div>
  </header>
</template>

<style scoped>
/* No custom styles needed since Tailwind CSS handles styling */
</style>
