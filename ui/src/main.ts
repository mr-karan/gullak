import { createApp } from 'vue'
import createNotivue from '@kyvg/vue3-notification'

import App from './App.vue'
import router from './router'

import './assets/main.css'

const app = createApp(App)

app.use(router)
app.use(createNotivue)

app.mount('#app')