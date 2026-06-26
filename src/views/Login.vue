<template>
  <div
    class="min-h-screen bg-background dark:bg-background overflow-hidden relative flex items-start sm:items-center justify-center p-2 sm:p-4 pt-1"
  >
    <!-- Theme Toggle in top right -->
    <div class="absolute top-4 right-4 z-20">
      <ThemeToggle />
    </div>
    <!-- Background gradient ellipses with animation -->
    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-80 animate-pulse-slow -top-[79px] left-[575px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-75 animate-pulse-slower -top-[94px] -left-[92px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <div
      class="bg-gradient-light dark:bg-gradient-dark absolute rounded-full -rotate-[24.22deg] w-[705px] h-[512px] blur-[120px] opacity-80 animate-pulse-slowest top-[373px] left-[246px] mix-blend-multiply dark:mix-blend-screen pointer-events-none"
    ></div>

    <!-- Login Card with enhanced glass effect -->
    <div
      class="login-card relative z-10 w-full max-w-md p-6 sm:p-10 rounded-[16px] sm:rounded-[24px] border-0 sm:border sm:border-stroke-subtle dark:sm:border-stroke/20 backdrop-blur-xl"
    >
      <!-- Decorative glow effect -->
      <div
        class="absolute inset-0 rounded-[24px] bg-gradient-to-br from-primary/3 dark:from-primary/5 to-transparent pointer-events-none"
      ></div>

      <!-- Content -->
      <div class="relative login-content">
        <!-- Logo/Title -->
        <div class="text-center">
          <div class="flex justify-center">
            <img
              :src="logoSrc"
              alt="openHop"
              class="logo-image h-[178px] sm:h-[210px] relative z-10"
            />
          </div>
          <h1 class="text-content-primary text-xl sm:text-2xl font-heading font-bold mt-1 mb-1">
            Repeater
          </h1>
          <p v-if="siteName" class="text-content-primary text-sm sm:text-base font-semibold mb-1">
            {{ siteName }}
          </p>
          <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm pt-2">
            Sign in to access your dashboard
          </p>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" autocomplete="on" action="/" class="space-y-3 sm:space-y-4">
          <!-- Username Field -->
          <div class="form-group">
            <label
              for="username"
              class="block text-content-secondary dark:text-content-primary/90 text-xs sm:text-sm font-medium mb-2"
            >
              Username
            </label>
            <div class="relative">
              <input
                id="username"
                name="username"
                v-model="username"
                type="text"
                autocomplete="username"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                required
                class="input-glass w-full px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-[12px] text-content-primary text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-primary/50 transition-all duration-300"
                placeholder="Enter username"
                :disabled="loading || isRateLimited"
              />
              <div class="absolute inset-0 rounded-[12px] pointer-events-none input-glow"></div>
            </div>
          </div>

          <!-- Password Field -->
          <div class="form-group">
            <label
              for="password"
              class="block text-content-secondary dark:text-content-primary/90 text-xs sm:text-sm font-medium mb-2"
            >
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                name="password"
                v-model="password"
                type="password"
                autocomplete="current-password"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                required
                class="input-glass w-full px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-[12px] text-content-primary text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-primary/50 transition-all duration-300"
                placeholder="Enter password"
                :disabled="loading || isRateLimited"
              />
              <div class="absolute inset-0 rounded-[12px] pointer-events-none input-glow"></div>
            </div>
          </div>

          <!-- Error Message -->
          <div
            v-if="errorMessage"
            class="bg-accent-red/10 border border-accent-red/30 rounded-[12px] p-2.5 sm:p-3.5 backdrop-blur-sm animate-shake"
          >
            <p class="text-accent-red text-xs sm:text-sm font-medium">
              {{ errorMessage }}
            </p>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading || isRateLimited"
            class="button-glass w-full relative overflow-hidden bg-primary/20 hover:bg-primary/30 active:scale-[0.98] text-primary dark:text-white font-semibold py-3 sm:py-4 px-4 rounded-[12px] border border-primary/50 hover:border-primary/60 transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 sm:gap-2.5 group mt-6 sm:mt-8 text-sm sm:text-base backdrop-blur-sm"
          >
            <Spinner v-if="loading" size="sm" color="white" />
            <svg
              v-else
              class="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform duration-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
              />
            </svg>
            <span class="relative">
              {{
                loading
                  ? 'Signing in...'
                  : isRateLimited
                    ? `Try again in ${rateLimitSeconds}s`
                    : 'Sign In'
              }}
            </span>
          </button>
        </form>

        <!-- Footer Info -->
        <div class="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-stroke-subtle dark:border-stroke/10">
          <!-- Powered by MeshCore -->
          <div class="flex flex-col items-center justify-center mb-4">
            <p class="text-content-muted text-[10px] sm:text-xs mb-1.5 tracking-wide uppercase opacity-60">Powered by</p>
            <img
              src="@/assets/meshcore.svg"
              alt="MeshCore"
              class="h-4 sm:h-5 opacity-50 brightness-0 dark:brightness-100"
            />
          </div>
          <div class="flex items-center justify-center gap-3">
            <a
              href="https://github.com/rightup"
              target="_blank"
              class="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
              title="GitHub"
            >
              <GitHubIcon
                class="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:text-primary transition-colors"
              />
            </a>
            <a
              href="https://buymeacoffee.com/rightup"
              target="_blank"
              class="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-secondary/10 hover:border-secondary/50 dark:hover:border-secondary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
              title="Buy Me a Coffee"
            >
              <CoffeeIcon
                class="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:text-secondary transition-colors"
              />
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Password Change Modal -->
    <ChangePasswordModal
      :is-open="showPasswordChangeModal"
      :can-skip="true"
      @close="handlePasswordChangeClose"
      @success="handlePasswordChangeSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { setToken, getClientId } from '@/utils/auth';
import { authClient } from '@/utils/api';
import { useAppRuntimeStore } from '@/stores/appRuntime';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue';
import Spinner from '@/components/ui/Spinner.vue';
import GitHubIcon from '@/components/icons/github.vue';
import CoffeeIcon from '@/components/icons/coffee.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useTheme } from '@/composables/useTheme';
import openHopLogo from '@/assets/logo/openhop_transparent_trim.png';

// Define component name for linting
defineOptions({
  name: 'LoginView',
});

interface LoginResponse {
  success: boolean;
  token?: string;
  error?: string;
  username?: string;
  expires_in?: number;
}

const router = useRouter();
const appRuntime = useAppRuntimeStore();
const { theme } = useTheme();
const logoSrc = computed(() => openHopLogo);

const username = ref('admin');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');
const rateLimitSeconds = ref(0);
const showPasswordChangeModal = ref(false);
const usedDefaultCredentials = ref(false);
const siteName = ref('');
const isRateLimited = computed(() => rateLimitSeconds.value > 0);
let rateLimitTimer: ReturnType<typeof setInterval> | null = null;

const stopRateLimitTimer = () => {
  if (rateLimitTimer) {
    clearInterval(rateLimitTimer);
    rateLimitTimer = null;
  }
};

const startRateLimitCooldown = (seconds: number) => {
  const safeSeconds = Math.max(1, Math.floor(seconds));
  rateLimitSeconds.value = safeSeconds;
  stopRateLimitTimer();

  rateLimitTimer = setInterval(() => {
    if (rateLimitSeconds.value <= 1) {
      rateLimitSeconds.value = 0;
      stopRateLimitTimer();
      return;
    }
    rateLimitSeconds.value -= 1;
  }, 1000);
};

onBeforeUnmount(() => {
  stopRateLimitTimer();
});

onMounted(async () => {
  try {
    const resp = await authClient.get<{ success: boolean; site_name: string }>('/api/site_info');
    siteName.value = resp.data?.site_name ?? '';
  } catch {
    // Silently ignore — site name is purely cosmetic
  }
});

const handleLogin = async () => {
  if (isRateLimited.value) {
    errorMessage.value = `Too many login attempts. Please try again in ${rateLimitSeconds.value}s.`;
    return;
  }

  errorMessage.value = '';
  loading.value = true;

  try {
    const clientId = getClientId();

    const response = await authClient.post<LoginResponse>('/auth/login', {
      username: username.value,
      password: password.value,
      client_id: clientId,
    });

    // Response is direct from axios
    const loginData = response.data;

    if (loginData.success && loginData.token) {
      rateLimitSeconds.value = 0;
      stopRateLimitTimer();
      // Check if default credentials were used
      const isDefaultPassword = password.value === 'admin123';

      if (isDefaultPassword) {
        // Store token temporarily and show password change modal
        setToken(loginData.token);
        appRuntime.markAuthenticated();
        usedDefaultCredentials.value = true;
        showPasswordChangeModal.value = true;
      } else {
        // Store token and redirect to dashboard
        setToken(loginData.token);
        appRuntime.markAuthenticated();
        router.push('/');
      }
    } else {
      errorMessage.value = loginData.error || 'Login failed';
    }
  } catch (error: unknown) {
    console.error('Login error:', error);
    const err = error as {
      response?: {
        status?: number;
        headers?: Record<string, string | number>;
        data?: { error?: string; retry_after?: number };
      };
    };
    const status = err.response?.status;
    const retryAfterHeader = Number(err.response?.headers?.['retry-after'] ?? 0);
    const retryAfterBody = Number(err.response?.data?.retry_after ?? 0);
    const retryAfter = Math.max(retryAfterHeader, retryAfterBody);

    if (status === 429 && retryAfter > 0) {
      startRateLimitCooldown(retryAfter);
      errorMessage.value =
        err.response?.data?.error ||
        `Too many login attempts. Please try again in ${rateLimitSeconds.value}s.`;
    } else {
      errorMessage.value = err.response?.data?.error || 'Connection error. Please try again.';
    }
  } finally {
    loading.value = false;
  }
};

const handlePasswordChangeSuccess = () => {
  // Password changed successfully, redirect to dashboard
  showPasswordChangeModal.value = false;
  router.push('/');
};

const handlePasswordChangeClose = () => {
  // User closed modal without changing password
  showPasswordChangeModal.value = false;
  if (usedDefaultCredentials.value) {
    // Still redirect to dashboard but they skipped password change
    router.push('/');
  }
};
</script>

<style scoped>
/* Background gradient colors — match app primary blue/purple with subtle contrast */
.bg-gradient-light {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--color-primary) 25%, transparent),
    color-mix(in srgb, var(--color-secondary) 15%, transparent)
  );
}

.bg-gradient-dark {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--color-primary) 12%, transparent),
    color-mix(in srgb, var(--color-secondary) 8%, transparent)
  );
}

/* Enhanced glass morphism effect */
.login-card {
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  box-shadow: var(--color-glass-shadow);
}

/* Light mode card */
.login-card {
  background: color-mix(in srgb, var(--color-surface) 85%, transparent);
}

/* Dark mode card with slightly stronger elevation for depth */
.dark .login-card {
  background: color-mix(in srgb, var(--color-surface-elevated) 80%, transparent);
}

/* Glass inputs */
.input-glass {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Input backgrounds and borders */
.input-glass {
  background: color-mix(in srgb, var(--color-surface) 90%, transparent);
  border: 1px solid var(--color-border);
}

.dark .input-glass {
  background: color-mix(in srgb, var(--color-surface-elevated) 55%, transparent);
  border-color: var(--color-border-subtle);
}

.input-glass:focus {
  background: var(--color-surface);
}

.dark .input-glass:focus {
  background: color-mix(in srgb, var(--color-surface-elevated) 70%, transparent);
}

.input-glass:focus {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent),
    0 0 20px color-mix(in srgb, var(--color-accent-cyan) 15%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-surface) 45%, transparent);
}

.input-glow {
  opacity: 0;
  transition: opacity 0.3s ease;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-surface) 35%, transparent);
}

.input-glass:focus + .input-glow {
  opacity: 1;
  box-shadow:
    0 0 20px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-surface) 45%, transparent);
}

/* Glass button */
.button-glass {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  position: relative;
}

.button-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  padding: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--color-accent-cyan) 30%, transparent) 50%,
    transparent 100%
  );
  -webkit-mask:
    linear-gradient(var(--color-surface) 0 0) content-box,
    linear-gradient(var(--color-surface) 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  transform: translateX(-100%);
  transition: transform 1s ease;
}

.button-glass:hover:not(:disabled)::before {
  transform: translateX(100%);
}

.button-glass {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent),
    0 4px 16px color-mix(in srgb, var(--color-background) 35%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-surface) 45%, transparent);
}

.button-glass:hover:not(:disabled) {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-accent-cyan) 40%, transparent),
    0 0 30px color-mix(in srgb, var(--color-accent-cyan) 30%, transparent),
    0 4px 20px color-mix(in srgb, var(--color-background) 45%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--color-surface) 55%, transparent);
}


/* Floating animation for logo */
@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* Pulse animations for background */
@keyframes pulse-slow {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.05);
  }
}

@keyframes pulse-slower {
  0%,
  100% {
    opacity: 0.75;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.08);
  }
}

@keyframes pulse-slowest {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.06);
  }
}

.animate-pulse-slow {
  animation: pulse-slow 8s ease-in-out infinite;
}

.animate-pulse-slower {
  animation: pulse-slower 10s ease-in-out infinite;
}

.animate-pulse-slowest {
  animation: pulse-slowest 12s ease-in-out infinite;
}

/* Shake animation for errors */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-5px);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(5px);
  }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}


/* Form group hover effect */
.form-group {
  position: relative;
}

.form-group:hover label {
  color: var(--color-accent-cyan);
  transition: color 0.3s ease;
}
</style>
