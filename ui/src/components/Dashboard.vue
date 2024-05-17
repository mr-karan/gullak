<script setup>
import { ref } from 'vue'

const inputValue = ref('');

const handleSubmit = () => {
  // Handle the submission logic here
  console.log(inputValue.value);
};
</script>

<template>
  <div class="dashboard">
    <h1>Welcome to Your Dashboard</h1>
    <form @submit.prevent="handleSubmit">
      <input type="text" placeholder="Type here..." v-model="inputValue">
      <button type="submit">Submit</button>
    </form>
  </div>
</template>


<style scoped>
.dashboard input {
  margin-top: 10px;
  padding: 8px;
}

.dashboard button {
  padding: 8px 16px;
  background-color: #007bff;
  color: white;
  border: none;
  cursor: pointer;
}
</style>
