import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  apiClient: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}))

// The sparkline only needs to know which radios exist and which is default.
const profiles = ref<{ radioId: string; profile: null }[]>([])
const isMultiRadio = ref(false)
const defaultRadioId = ref<string | null>(null)
vi.mock('@/composables/useRadioProfiles', () => ({
  useRadioProfiles: () => ({ profiles, isMultiRadio, defaultRadioId }),
}))

async function mountSparkline(stats: Record<string, unknown>) {
  const { useSystemStore } = await import('@/stores/system')
  const { usePacketStore } = await import('@/stores/packets')
  const system = useSystemStore()
  const packets = usePacketStore()
  system.stats = stats as never
  const NoiseFloorSparkline = (await import('@/components/nav/NoiseFloorSparkline.vue')).default
  const wrapper = mount(NoiseFloorSparkline, {
    global: { stubs: { InteractiveSparkline: true } },
  })
  await nextTick()
  return { wrapper, system, packets }
}

describe('NoiseFloorSparkline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    profiles.value = [
      { radioId: 'local', profile: null },
      { radioId: 'link', profile: null },
    ]
    isMultiRadio.value = true
    defaultRadioId.value = 'local'
  })

  it('draws a live curve for every radio, not just the default one', async () => {
    const { wrapper, system, packets } = await mountSparkline({
      noise_floor_dbm: -118,
      noise_floor_radios: [
        { radio_id: 'local', noise_floor_dbm: -118 },
        { radio_id: 'link', noise_floor_dbm: -101 },
      ],
    })

    expect(packets.noiseFloorHistory.map((p) => p.radio_id)).toEqual(['local', 'link'])
    expect(wrapper.text()).toContain('-118.0 dBm')
    expect(wrapper.text()).toContain('-101.0 dBm')

    // The next poll moves only the non-default radio: its curve must follow.
    system.stats = {
      noise_floor_dbm: -118,
      noise_floor_radios: [
        { radio_id: 'local', noise_floor_dbm: -118 },
        { radio_id: 'link', noise_floor_dbm: -96 },
      ],
    } as never
    await nextTick()

    expect(packets.noiseFloorHistory.filter((p) => p.radio_id === 'link')).toHaveLength(2)
    expect(wrapper.text()).toContain('-96.0 dBm')
  })

  it('labels each radio', async () => {
    const { wrapper } = await mountSparkline({
      noise_floor_dbm: -118,
      noise_floor_radios: [
        { radio_id: 'local', noise_floor_dbm: -118 },
        { radio_id: 'link', noise_floor_dbm: -101 },
      ],
    })

    expect(wrapper.text()).toContain('Noise Floor • local')
    expect(wrapper.text()).toContain('Noise Floor • link')
  })

  it('stamps the scalar with the default radio when the backend sends no per-radio figures', async () => {
    const { packets } = await mountSparkline({ noise_floor_dbm: -118 })

    expect(packets.noiseFloorHistory).toEqual([
      expect.objectContaining({ noise_floor_dbm: -118, radio_id: 'local' }),
    ])
  })

  it('leaves a single-radio node unattributed and unlabelled', async () => {
    profiles.value = [{ radioId: 'radio0', profile: null }]
    isMultiRadio.value = false
    defaultRadioId.value = null

    const { wrapper, packets } = await mountSparkline({ noise_floor_dbm: -104 })

    expect(packets.noiseFloorHistory).toEqual([
      expect.objectContaining({ noise_floor_dbm: -104, radio_id: null }),
    ])
    expect(wrapper.text()).toContain('Noise Floor')
    expect(wrapper.text()).not.toContain('•')
  })
})
