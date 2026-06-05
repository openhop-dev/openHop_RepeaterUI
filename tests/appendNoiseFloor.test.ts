import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  API_SERVER_URL: '',
}))

describe('appendNoiseFloorReading', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  async function getStore() {
    const { usePacketStore } = await import('@/stores/packets')
    return usePacketStore()
  }

  it('appends a reading to noiseFloorHistory', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(-97)
    expect(store.noiseFloorHistory).toHaveLength(1)
    expect(store.noiseFloorHistory[0].noise_floor_dbm).toBe(-97)
  })

  it('ignores zero values', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(0)
    expect(store.noiseFloorHistory).toHaveLength(0)
  })

  it('does not duplicate if same value within 2 seconds', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(-97)
    store.appendNoiseFloorReading(-97)
    expect(store.noiseFloorHistory).toHaveLength(1)
  })

  it('allows a new value even if timestamp matches', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(-97)
    store.appendNoiseFloorReading(-95) // different value — should append
    expect(store.noiseFloorHistory).toHaveLength(2)
  })

  it('sets a unix timestamp in seconds', async () => {
    const before = Math.floor(Date.now() / 1000)
    const store = await getStore()
    store.appendNoiseFloorReading(-100)
    const after = Math.floor(Date.now() / 1000)
    const ts = store.noiseFloorHistory[0].timestamp
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})
