import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import JobDetailView from './views/JobDetailView.vue'
import AuditView from './views/AuditView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/audit', name: 'audit', component: AuditView },
    { path: '/jobs/:id', name: 'job-detail', component: JobDetailView, props: true },
  ],
})

export default router
