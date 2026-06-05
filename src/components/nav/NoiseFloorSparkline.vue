<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePacketStore } from '@/stores/packets'
import { useSystemStore } from '@/stores/system'
import InteractiveSparkline from '@/components/ui/InteractiveSparkline.vue'

defineOptions({ name: 'NoiseFloorSparkline' })

const packetStore = usePacketStore()
const systemStore = useSystemStore()

watch(
  () => systemStore.noiseFloorDbm,
  (dbm) => { if (dbm !== null) packetStore.appendNoiseFloorReading(dbm) },
)

const currentValue = computed(() => systemStore.noiseFloorDbm ?? packetStore.currentNoiseFloor)

const sparklineRef = ref<InstanceType<typeof InteractiveSparkline> | null>(null)

const sparklineData = computed(() => {
  if (!packetStore.noiseFloorHistory?.length) return []
  const oneHourAgo = Date.now() / 1000 - 3600
  return packetStore.noiseFloorHistory
    .filter((p) => p.noise_floor_dbm !== 0 && p.timestamp >= oneHourAgo)
    .map((p) => ({ value: p.noise_floor_dbm, timestamp: p.timestamp }))
})

const displayValue = computed(() =>
  sparklineRef.value?.hoveredPoint?.value ?? currentValue.value,
)
</script>

<template>
  <div v-if="currentValue !== null" class="mt-2 pt-2 border-t border-stroke-subtle dark:border-white/10">
    <div class="flex items-center justify-between text-[10px] text-content-muted dark:text-content-muted uppercase tracking-wide mb-1">
      <span>Noise Floor</span>
      <span class="text-content-primary dark:text-content-primary normal-case tracking-normal font-medium">
        {{ displayValue }} dBm
      </span>
    </div>
    <InteractiveSparkline
      ref="sparklineRef"
      :data="sparklineData"
      unit="dBm"
    />
  </div>
</template>
