<script setup>
import { ref } from 'vue'
import axios from 'axios'
// import { getCurrentInstance } from 'vue'
import { useToast } from 'vue-toastification'  // Assuming toast notifications are setup

const toast = useToast()
const inputValue = ref('')
const isLoading = ref(false)
// const instance = getCurrentInstance()
// const apiUrl = instance.appContext.config.globalProperties.$apiUrl

const handleSubmit = async () => {
    console.log("hello")
    try {
        isLoading.value = true
        const response = await axios.post(`/api/ingest`,
            {
                line: inputValue.value
            });
        toast.success('Transaction saved successfully!')
        console.log(response.data)  // Log the response data
        inputValue.value = ''  // Clear input after success
    } catch (error) {
        toast.error('Error saving transaction: ' + error.message)
    } finally {
        isLoading.value = false
    }
};
</script>


<template>
    <div class="bg-white p-6">
        <div class="mb-6">
            <h1 class="text-2xl font-bold mb-4">Add a new transaction</h1>
            <div class="flex gap-2">
                <input type="text" placeholder="Type something like '20.00 for groceries'" class="form-input flex-1"
                    v-model="inputValue" minlength="5" maxlength="1000" required>
                <button class="btn-primary" :disabled="isLoading" @click="handleSubmit">
                    <span v-if="isLoading">Loading...</span>
                    <span v-else>Save transaction</span>
                </button>
            </div>
        </div>
        <div>
            <h2 class="text-xl font-semibold mb-4">Recent transactions</h2>
            <div class="flex flex-col gap-2">
                <div class="transaction-card">
                    <span>$20.00</span>
                    <span>Groceries</span>
                    <button class="btn-secondary">Confirm</button>
                </div>
                <div class="transaction-card">
                    <span>$50.00</span>
                    <span>Gas</span>
                    <button class="btn-secondary">Confirm</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.form-input {
    @apply bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5;
}

.btn-primary {
    @apply bg-yellow-400 hover:bg-yellow-500 text-white font-medium py-2 px-4 rounded transition-colors duration-200;
}

.btn-secondary {
    @apply bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-2 px-4 rounded transition-colors duration-200;
}

.transaction-card {
    @apply flex justify-between items-center bg-gray-100 p-4 rounded;
}
</style>
