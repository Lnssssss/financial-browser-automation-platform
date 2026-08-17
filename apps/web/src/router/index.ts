import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局路由守卫：非 public 路由需登录
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.isAuthenticated()) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.isAuthenticated()) {
    return { name: 'dashboard' };
  }
  return true;
});
