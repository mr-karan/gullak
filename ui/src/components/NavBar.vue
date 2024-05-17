<script setup>
</script>

<template>
    <header class="top-nav">
        <div class="logo">Money Manager</div>
        <nav class="nav-links">
            <router-link to="/dashboard">Dashboard</router-link>
            <router-link to="/transactions">Transactions</router-link>
            <router-link to="/reports">Reports</router-link>
            <router-link to="/settings">Settings</router-link>
        </nav>
    </header>
</template>

<style scoped>
.top-nav {
    display: flex;
    justify-content: space-between;
    padding: 10px 20px;
    background-color: #f8f9fa;
}

.nav-links a {
    margin-right: 10px;
    text-decoration: none;
    color: black;
}
</style>