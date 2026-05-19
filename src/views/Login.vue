<template>
  <div
    class="min-h-screen bg-background dark:bg-background overflow-hidden relative flex items-start sm:items-center justify-center p-2 sm:p-4 pt-8 sm:pt-4"
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
      class="login-card relative z-10 w-full max-w-md p-6 sm:p-10 rounded-[16px] sm:rounded-[24px] border-0 sm:border sm:border-stroke-subtle dark:sm:border-stroke/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] backdrop-blur-xl"
    >
      <!-- Decorative glow effect -->
      <div
        class="absolute inset-0 rounded-[24px] bg-gradient-to-br from-primary/3 dark:from-primary/5 to-transparent pointer-events-none"
      ></div>

      <!-- Content -->
      <div class="relative login-content">
        <!-- Logo/Title -->
        <div class="text-center mb-6 sm:mb-10">
          <div class="mb-4 sm:mb-6 flex justify-center">
            <img
              :src="logoSrc"
              alt="pyMC"
              class="logo-image h-36 sm:h-40 relative z-10"
            />
          </div>
          <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
            Sign in to access your dashboard
          </p>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-4 sm:space-y-5">
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
                v-model="username"
                type="text"
                autocomplete="username"
                required
                class="input-glass w-full px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-[12px] text-content-primary dark:text-content-primary text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-primary/50 transition-all duration-300"
                placeholder="Enter username"
                :disabled="loading"
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
                v-model="password"
                type="password"
                autocomplete="current-password"
                required
                class="input-glass w-full px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-[12px] text-content-primary dark:text-content-primary text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-primary/50 transition-all duration-300"
                placeholder="Enter password"
                :disabled="loading"
              />
              <div class="absolute inset-0 rounded-[12px] pointer-events-none input-glow"></div>
            </div>
          </div>

          <!-- Error Message -->
          <div
            v-if="errorMessage"
            class="bg-red-500/10 border border-red-500/30 rounded-[12px] p-2.5 sm:p-3.5 backdrop-blur-sm animate-shake"
          >
            <p class="text-red-600 dark:text-red-400 text-xs sm:text-sm font-medium">
              {{ errorMessage }}
            </p>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
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
            <span class="relative">{{ loading ? 'Signing in...' : 'Sign In' }}</span>
          </button>
        </form>

        <!-- Footer Info -->
        <div class="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-stroke-subtle dark:border-stroke/10">
          <!-- Powered by MeshCore -->
          <div class="flex flex-col items-center justify-center mb-4">
            <p class="text-content-muted dark:text-content-muted text-[10px] sm:text-xs mb-1.5 tracking-wide uppercase opacity-60">Powered by</p>
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
              class="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
              title="GitHub"
            >
              <GitHubIcon
                class="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:text-primary transition-colors"
              />
            </a>
            <a
              href="https://buymeacoffee.com/rightup"
              target="_blank"
              class="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-yellow-50 dark:hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
              title="Buy Me a Coffee"
            >
              <CoffeeIcon
                class="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:text-yellow-500 transition-colors"
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
import { ref, computed } from 'vue';
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
import logoDark from '@/assets/logo/transparent/logo_pyMC_RBGA_640-Dark.png';
import logoLight from '@/assets/logo/transparent/logo_pyMC_RBGA_640-Light.png';

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
const logoSrc = computed(() => theme.value === 'dark' ? logoDark : logoLight);

const username = ref('admin');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');
const showPasswordChangeModal = ref(false);
const usedDefaultCredentials = ref(false);

const handleLogin = async () => {
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
    const err = error as { response?: { data?: { error?: string } } };
    errorMessage.value = err.response?.data?.error || 'Connection error. Please try again.';
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
/* Background gradient colors — match app primary teal (#0d7377 light / #aae8e8 dark) */
.bg-gradient-light {
  background: linear-gradient(to bottom, rgba(13, 115, 119, 0.3), rgba(170, 232, 232, 0.2));
}

.bg-gradient-dark {
  background: linear-gradient(to bottom, rgba(170, 232, 232, 0.18), rgba(13, 115, 119, 0.1));
}

/* Enhanced glass morphism effect */
.login-card {
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
}

/* Light mode card */
.login-card {
  background: rgba(255, 255, 255, 0.85);
}

/* Dark mode card — surface-elevated (#1a1e1f) with slight transparency */
.dark .login-card {
  background: rgba(26, 30, 31, 0.8);
}

/* Glass inputs */
.input-glass {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Input backgrounds and borders */
.input-glass {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #d1d5db;
}

.dark .input-glass {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.input-glass:focus {
  background: rgba(255, 255, 255, 1);
}

.dark .input-glass:focus {
  background: rgba(255, 255, 255, 0.1);
}

.input-glass:focus {
  box-shadow:
    0 0 0 1px rgba(170, 232, 232, 0.2),
    0 0 20px rgba(170, 232, 232, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.input-glow {
  opacity: 0;
  transition: opacity 0.3s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.input-glass:focus + .input-glow {
  opacity: 1;
  box-shadow:
    0 0 20px rgba(170, 232, 232, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
    rgba(170, 232, 232, 0.3) 50%,
    transparent 100%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
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
    0 0 0 1px rgba(170, 232, 232, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.button-glass:hover:not(:disabled) {
  box-shadow:
    0 0 0 1px rgba(170, 232, 232, 0.4),
    0 0 30px rgba(170, 232, 232, 0.3),
    0 4px 20px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
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
  color: rgba(170, 232, 232, 0.9);
  transition: color 0.3s ease;
}
</style>
