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

  it('does not duplicate a radio reading that another radio was appended after', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(-118, 'local')
    store.appendNoiseFloorReading(-101, 'link')
    // A history poll lands and re-offers local's reading. Checking only the
    // final row would compare it against link's and append a duplicate.
    store.appendNoiseFloorReading(-118, 'local')
    expect(store.noiseFloorHistory).toHaveLength(2)
  })

  it('keeps each radio on its own series', async () => {
    const store = await getStore()
    store.appendNoiseFloorReading(-118, 'local')
    store.appendNoiseFloorReading(-118, 'link')
    expect(store.noiseFloorHistory.map((p) => p.radio_id)).toEqual(['local', 'link'])
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

  it('keeps duplicate packet outcomes separate when they share a packet hash', async () => {
    const store = await getStore()

    const droppedPacket = {
      id: 1,
      timestamp: 1700000000,
      packet_hash: 'abc123',
      type: 4,
      route: 1,
      src_hash: 'src1',
      dst_hash: 'dst1',
      rssi: -90,
      snr: 8,
      length: 35,
      transported: false,
      transmitted: false,
      is_duplicate: true,
      drop_reason: 'duplicate packet',
      score: 42,
      tx_delay_ms: 0,
    }

    const forwardedPacket = {
      id: 2,
      timestamp: 1700000001,
      packet_hash: 'abc123',
      type: 4,
      route: 1,
      src_hash: 'src1',
      dst_hash: 'dst1',
      rssi: -88,
      snr: 9,
      length: 35,
      transported: true,
      transmitted: true,
      is_duplicate: true,
      score: 45,
      tx_delay_ms: 10,
    }

    store.addRealtimePacket(droppedPacket)
    store.addRealtimePacket(forwardedPacket)

    expect(store.recentPackets).toHaveLength(2)
    expect(store.recentPackets.some((packet) => packet.drop_reason === 'duplicate packet')).toBe(true)
    expect(store.recentPackets.some((packet) => packet.transmitted)).toBe(true)
  })
})
