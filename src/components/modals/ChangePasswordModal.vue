<template>
  <Teleport to="body">
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    @click.self="closeModal"
  >
    <div
      class="glass-card backdrop-blur-xl border border-stroke-subtle dark:border-white/20 rounded-[15px] p-6 max-w-md w-full shadow-2xl"
    >
      <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary mb-2">
        Change Default Password
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-sm mb-6">
        You're using the default password. Please change it to secure your account.
      </p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- Current Password -->
        <div>
          <label
            class="block text-sm font-medium text-content-secondary dark:text-content-primary/70 mb-2"
            >Current Password</label
          >
          <input
            v-model="currentPassword"
            type="password"
            required
            class="w-full px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary transition-colors"
            placeholder="Enter current password"
          />
        </div>

        <!-- New Password -->
        <div>
          <label
            class="block text-sm font-medium text-content-secondary dark:text-content-primary/70 mb-2"
            >New Password</label
          >
          <input
            v-model="newPassword"
            type="password"
            required
            minlength="8"
            class="w-full px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary transition-colors"
            placeholder="Enter new password (min 8 characters)"
          />
        </div>

        <!-- Confirm Password -->
        <div>
          <label
            class="block text-sm font-medium text-content-secondary dark:text-content-primary/70 mb-2"
            >Confirm New Password</label
          >
          <input
            v-model="confirmPassword"
            type="password"
            required
            minlength="8"
            class="w-full px-4 py-2 bg-white dark:bg-white/5 border border-stroke-subtle dark:border-stroke/10 rounded-lg text-content-primary dark:text-content-primary placeholder-gray-500 dark:placeholder-white/40 focus:outline-none focus:border-primary transition-colors"
            placeholder="Confirm new password"
          />
        </div>

        <!-- Error Message -->
        <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p class="text-red-600 dark:text-red-400 text-sm">{{ error }}</p>
        </div>

        <!-- Success Message -->
        <div
          v-if="success"
          class="bg-green-500/10 border border-green-600/40 dark:border-green-500/30 rounded-lg p-3"
        >
          <p class="text-green-600 dark:text-green-400 text-sm">{{ success }}</p>
        </div>

        <!-- Buttons -->
        <div class="flex justify-end gap-3 mt-6">
          <button
            v-if="canSkip"
            type="button"
            @click="skipChange"
            :disabled="loading"
            class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg border border-stroke-subtle dark:border-stroke/10 transition-colors disabled:opacity-50"
          >
            Skip for Now
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="btn-primary flex items-center gap-2"
          >
            <Spinner v-if="loading" size="sm" color="current" />
            {{ loading ? 'Changing...' : 'Change Password' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { authClient } from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';

defineOptions({ name: 'ChangePasswordModal' });

interface Props {
  isOpen: boolean;
  canSkip?: boolean;
}

interface ChangePasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  canSkip: true,
});

const emit = defineEmits<{
  close: [];
  success: [];
}>();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');

const closeModal = () => {
  if (!loading.value) {
    emit('close');
  }
};

const skipChange = () => {
  emit('close');
};

const handleSubmit = async () => {
  error.value = '';
  success.value = '';

  // Validation
  if (newPassword.value.length < 8) {
    error.value = 'New password must be at least 8 characters long';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  if (newPassword.value === currentPassword.value) {
    error.value = 'New password must be different from current password';
    return;
  }

  loading.value = true;

  try {
    const response = await authClient.post<ChangePasswordResponse>('/auth/change_password', {
      current_password: currentPassword.value,
      new_password: newPassword.value,
    });

    const data = response.data;

    if (data && data.success) {
      success.value = data.message || 'Password changed successfully!';

      // Wait a moment to show success message, then emit success and close
      setTimeout(() => {
        emit('success');
        emit('close');
      }, 1500);
    } else {
      error.value = data?.error || 'Failed to change password';
    }
  } catch (err: any) {
    console.error('Password change error:', err);
    error.value = err.response?.data?.error || 'Failed to change password. Please try again.';
  } finally {
    loading.value = false;
  }
};
</script>
