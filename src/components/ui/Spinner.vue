<script setup lang="ts">
withDefaults(defineProps<{
  /**
   * xs  — 12px / border-b   — tiny inline indicator
   * sm  — 16px / border-b-2 — inline button spinner
   * md  — 32px / border-b-2 — section loading state (default)
   * lg  — 48px / border-b-2 — full-page loading state
   */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /**
   * primary — border-primary (default)
   * white   — border-white (for use on dark/coloured button backgrounds)
   * current — border-current (inherits text colour)
   */
  color?: 'primary' | 'white' | 'current';
}>(), {
  size: 'md',
  color: 'primary',
});
</script>

<template>
  <div
    class="rounded-full animate-spin"
    :class="{
      'w-3 h-3 border-b':     size === 'xs',
      'w-4 h-4 border-b-2':   size === 'sm',
      'w-8 h-8 border-b-2':   size === 'md',
      'w-12 h-12 border-b-2': size === 'lg',
      'border-primary': color === 'primary',
      'border-white':   color === 'white',
      'border-current': color === 'current',
    }"
  />
</template>
