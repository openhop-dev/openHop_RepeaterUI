<script setup lang="ts">
import { useTheme } from '@/composables/useTheme';

defineOptions({ name: 'AppearanceSettings' });

const { themeId, themes, setTheme } = useTheme();
</script>

<template>
  <div class="space-y-12">
    <div class="cfg-page-heading">
      <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
        Appearance
      </h3>
      <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
        Choose the colour theme for this browser. The choice is saved in a cookie.
      </p>
    </div>

    <div class="cfg-section">
      <h3 id="theme-heading" class="text-lg font-semibold text-content-primary mb-4">Theme</h3>
      <div
        role="radiogroup"
        aria-labelledby="theme-heading"
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-4"
      >
        <button
          v-for="option in themes"
          :key="option.id"
          type="button"
          role="radio"
          :aria-checked="themeId === option.id"
          :data-theme-option="option.id"
          class="group flex flex-col items-center gap-2 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @click="setTheme(option.id)"
        >
          <span
            aria-hidden="true"
            :class="[
              'w-full aspect-[3/1] rounded-xl border-2 flex items-center justify-center transition-shadow',
              themeId === option.id ? 'shadow-[0_0_0_1px_var(--color-border-hover)]' : 'group-hover:opacity-90',
            ]"
            :style="{
              backgroundColor: option.preview.background,
              borderColor: themeId === option.id ? 'var(--color-border-hover)' : option.preview.border,
            }"
          >
            <span
              class="w-[65%] h-[50%] rounded-md flex flex-col justify-center gap-[9%] px-[3%]"
              :style="{ backgroundColor: option.preview.surface }"
            >
              <span class="block h-[18%] w-[45%] rounded-full" :style="{ backgroundColor: option.preview.accent }" />
              <span class="block h-[10%] w-[75%] rounded-full" :style="{ backgroundColor: option.preview.text }" />
              <span class="block h-[10%] w-[55%] rounded-full" :style="{ backgroundColor: option.preview.text }" />
            </span>
          </span>
          <span
            :class="[
              'text-sm tracking-wide',
              themeId === option.id
                ? 'font-bold text-content-heading'
                : 'text-content-secondary group-hover:text-content-primary',
            ]"
          >
            {{ option.label }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
