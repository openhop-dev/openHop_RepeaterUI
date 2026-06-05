<script setup lang="ts">
defineOptions({ name: 'SignalBars' });

interface Props {
  bars: number; // 0–5 lit bars
  color: string; // text-* class from SignalQuality — active bars use bg-current
  size?: 'sm' | 'md'; // sm: w-1 h-1.5→h-3.5  md: w-1.5 h-2→h-4
}

const props = withDefaults(defineProps<Props>(), {
  size: 'sm',
});

// Safelist: h-1.5 h-2 h-2.5 h-3 h-3.5 h-4
const HEIGHTS: Record<'sm' | 'md', readonly string[]> = {
  sm: ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5'],
  md: ['h-2',   'h-2.5', 'h-3', 'h-3.5', 'h-4'],
};

const WIDTH: Record<'sm' | 'md', string> = {
  sm: 'w-1',
  md: 'w-1.5',
};
</script>

<template>
  <div class="flex items-end gap-0.5">
    <template v-for="i in 5" :key="i">
      <div
        :class="[
          'transition-colors',
          WIDTH[props.size],
          HEIGHTS[props.size][i - 1],
          i <= props.bars ? props.color : 'text-content-muted',
        ]"
      >
        <div class="w-full h-full bg-current rounded-sm"></div>
      </div>
    </template>
  </div>
</template>
