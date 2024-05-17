<script setup></script>

<template>
  <div class="container mx-auto p-6">
    <div class="bg-white p-6 rounded-lg shadow">
      <div class="mb-6">
        <h1 class="text-xl font-semibold">Add a new transaction</h1>
        <p>You can also add a note or split this transaction in multiple categories.</p>
      </div>
      <div class="mb-6">
        <input
          type="text"
          placeholder="Type something like '20.00 for groceries'"
          class="w-full p-2 border border-gray-300 rounded-md"
        />
      </div>
      <button
        class="bg-yellow-400 text-white font-bold py-2 px-4 rounded hover:bg-yellow-500 transition duration-150"
      >
        Save transaction
      </button>
    </div>

    <div class="mt-10 bg-white p-6 rounded-lg shadow">
      <h2 class="text-xl font-semibold mb-4">Recent transactions</h2>
      <ul>
        <!-- Sample transaction -->
        <li class="flex justify-between items-center py-2 border-b border-gray-200">
          <div class="flex items-center">
            <input type="checkbox" class="mr-2" />
            <span>$20.00 Groceries</span>
          </div>
          <button class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
            Confirm
          </button>
        </li>
        <li class="flex justify-between items-center py-2">
          <div class="flex items-center">
            <input type="checkbox" class="mr-2" />
            <span>$50.00 Gas</span>
          </div>
          <button class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">
            Confirm
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
