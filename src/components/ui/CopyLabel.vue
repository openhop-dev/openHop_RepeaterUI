<script setup lang="ts">
defineOptions({ name: 'CopyLabel' })

const props = withDefaults(defineProps<{
  copied: boolean
  label?: string
  confirmed?: string
}>(), {
  label: 'Copy',
  confirmed: 'Copied!',
})
</script>

<template>
  <!--
    Grid overlay: both strings occupy the same cell so the container is always
    sized to whichever is wider. The invisible sizer never collapses.
  -->
  <span class="relative inline-grid">
    <span class="invisible col-start-1 row-start-1 select-none" aria-hidden="true">
      {{ props.label.length >= props.confirmed.length ? props.label : props.confirmed }}
    </span>
    <Transition name="label-swap" mode="out-in">
      <span :key="copied ? 'confirmed' : 'default'" class="col-start-1 row-start-1 text-center">
        {{ copied ? confirmed : label }}
      </span>
    </Transition>
  </span>
</template>
