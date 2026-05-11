import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated } from '@/utils/auth';

// Lazy-load all views for faster initial load
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/Setup.vue'),
      meta: { requiresAuth: false, requiresSetup: false },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/neighbors',
      name: 'neighbors',
      component: () => import('@/views/Neighbors.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/statistics',
      name: 'statistics',
      component: () => import('@/views/Statistics.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/gps',
      name: 'gps-diagnostics',
      component: () => import('@/views/GPSDiagnostics.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/system-stats',
      name: 'system-stats',
      component: () => import('@/views/SystemStats.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/configuration',
      name: 'configuration',
      component: () => import('@/views/Configuration.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/cad-calibration',
      name: 'cad-calibration',
      component: () => import('@/views/CADCalibration.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/sessions',
      name: 'sessions',
      component: () => import('@/views/Sessions.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/room-servers',
      name: 'room-servers',
      component: () => import('@/views/RoomServers.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/companions',
      name: 'companions',
      component: () => import('@/views/Companions.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/views/Logs.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/terminal',
      name: 'terminal',
      component: () => import('@/views/Terminal.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/help',
      name: 'help',
      component: () => import('@/views/Help.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

// Check if setup is needed
async function checkSetupStatus() {
  try {
    const response = await fetch('/api/needs_setup', {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      console.error('Setup check failed:', response.status);
      return false;
    }
    const data = await response.json();
    return data.needs_setup === true;
  } catch (error) {
    console.error('Error checking setup status:', error);
    return false;
  }
}

// Navigation guard - check setup status and authentication
router.beforeEach(async (to) => {
  const requiresAuth = to.meta.requiresAuth !== false;
  const authenticated = isAuthenticated();

  if (to.path !== '/setup') {
    const needsSetup = await checkSetupStatus();
    if (needsSetup) return '/setup';
  }

  if (to.path === '/setup') {
    const needsSetup = await checkSetupStatus();
    if (!needsSetup) return '/login';
  }

  if (requiresAuth && !authenticated) return '/login';
  if (to.path === '/login' && authenticated) return '/';
});

export default router;
