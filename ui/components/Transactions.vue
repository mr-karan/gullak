<template>
  <div>
    <h1 class="title">Transactions</h1>
    <table class="table is-fullwidth">
      <thead>
        <tr>
          <th>Description</th>
          <th>Amount</th>
          <th>Currency</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="transaction in transactions" :key="transaction.id">
          <td>{{ transaction.description }}</td>
          <td>{{ transaction.amount }}</td>
          <td>{{ transaction.currency }}</td>
          <td>{{ transaction.date }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";

export default {
  name: "Transactions",
  setup() {
    const transactions = ref([]);

    const fetchTransactions = async () => {
      const response = await fetch("YOUR_API_URL/get-transactions");
      const data = await response.json();
      transactions.value = data.transactions;
    };

    onMounted(fetchTransactions);

    return {
      transactions,
    };
  },
};
</script>
