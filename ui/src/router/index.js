import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  base: '/',
  routes: [
    {
      path: '/',
      component: () => import('../views/Base.vue'),
      children: [
        {
          path: '/',
          name: 'dashboard',
          component: () => import('../views/Dashboard.vue')
        },
        {
          path: '/transactions',
          name: 'transactions',
          component: () => import('../views/Transactions.vue')
        },
        {
          path: '/reports',
          name: 'reports',
          component: () => import('../views/Reports.vue')
        }
      ]
    }
  ]
})

export default router
