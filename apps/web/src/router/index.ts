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
  {
    path: '/enterprise',
    component: () => import('@/layouts/EnterpriseLayout.vue'),
    children: [
      { path: '', redirect: '/enterprise/dashboard' },
      {
        path: 'dashboard',
        name: 'enterprise-dashboard',
        component: () => import('@/views/enterprise/dashboard/DashboardPage.vue'),
      },
      {
        path: 'approvals',
        name: 'enterprise-approvals',
        component: () => import('@/views/enterprise/approvals/ApprovalsPage.vue'),
      },
      {
        path: 'audit',
        name: 'enterprise-audit',
        component: () => import('@/views/enterprise/audit/AuditLogsPage.vue'),
      },
      {
        path: 'permissions',
        name: 'enterprise-permissions',
        component: () => import('@/views/enterprise/permissions/PermissionsPage.vue'),
      },
      {
        path: 'llm',
        name: 'enterprise-llm',
        component: () => import('@/views/enterprise/llm/LLMMonitorPage.vue'),
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
