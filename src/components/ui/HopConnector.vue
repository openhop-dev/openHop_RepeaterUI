<script setup lang="ts">
import RabbitIcon from '@/components/icons/rabbit.vue';

interface Props {
  status?: 'forward' | 'drop' | 'received';
}

withDefaults(defineProps<Props>(), {
  status: 'received',
});
</script>

<template>
  <span class="hop-connector" :class="`hop-connector-${status}`" title="Rabbit hop">
    <RabbitIcon class="hop-rabbit" />
  </span>
</template>

<style scoped>
.hop-connector {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2rem;
  height: 0.8rem;
  margin: 0 0.1rem;
}

.hop-rabbit {
  width: 0.65rem;
  height: 0.65rem;
}

.hop-connector-forward {
  color: color-mix(in srgb, var(--color-accent-cyan) 95%, transparent);
}

.hop-connector-forward .hop-rabbit {
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent));
}

.hop-connector-drop {
  color: color-mix(in srgb, var(--color-secondary) 95%, transparent);
}

.hop-connector-drop .hop-rabbit {
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--color-secondary) 55%, transparent));
}

.hop-connector-received {
  color: color-mix(in srgb, var(--color-primary) 75%, transparent);
}

.hop-connector-received .hop-rabbit {
  opacity: 0.9;
}

@media (max-width: 640px) {
  .hop-connector {
    width: 1rem;
    height: 0.7rem;
  }

  .hop-rabbit {
    width: 0.55rem;
    height: 0.55rem;
  }
}
</style>
