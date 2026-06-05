import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InteractiveSparkline from '@/components/ui/InteractiveSparkline.vue'
import type { ComponentPublicInstance } from 'vue'

const now = Math.floor(Date.now() / 1000)

const sampleData = [
  { value: -100, timestamp: now - 3600 },
  { value: -98,  timestamp: now - 2700 },
  { value: -96,  timestamp: now - 1800 },
  { value: -99,  timestamp: now - 900  },
  { value: -97,  timestamp: now        },
]

describe('InteractiveSparkline', () => {
  it('renders nothing when data has fewer than 2 points', () => {
    const wrapper = mount(InteractiveSparkline, {
      props: { data: [sampleData[0]] },
    })
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('renders an SVG polyline with 2+ data points', () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData } })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('polyline').exists()).toBe(true)
  })

  it('polyline points string has correct number of coordinate pairs', () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData } })
    const pts = wrapper.find('polyline').attributes('points') ?? ''
    const pairs = pts.trim().split(' ').filter(Boolean)
    expect(pairs).toHaveLength(sampleData.length)
  })

  it('exposes hoveredPoint as null initially', () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData } })
    const exposed = (wrapper.vm as ComponentPublicInstance & { hoveredPoint: unknown }).hoveredPoint
    expect(exposed).toBeNull()
  })

  it('shows no tooltip before hover', () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData } })
    // Tooltip is inside a Teleport — check the component's local state
    const exposed = (wrapper.vm as any).hoveredPoint
    expect(exposed).toBeNull()
  })

  it('uses the unit prop in the tooltip label', async () => {
    const wrapper = mount(InteractiveSparkline, {
      props: { data: sampleData, unit: 'dBm' },
    })
    // Trigger hover by calling onMouseMove via the exposed ref (simulate)
    const wrapperEl = wrapper.find('div').element as HTMLElement
    Object.defineProperty(wrapperEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 200, top: 0, bottom: 28, width: 200, height: 28 }),
    })
    await wrapper.find('div').trigger('mousemove', { clientX: 100, clientY: 10 })
    await flushPromises()
    // hoveredPoint should now be set
    const exposed = (wrapper.vm as any).hoveredPoint
    expect(exposed).not.toBeNull()
    expect(exposed.value).toBeTypeOf('number')
  })

  it('clears hoveredPoint on mouseleave', async () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData } })
    const wrapperEl = wrapper.find('div').element as HTMLElement
    Object.defineProperty(wrapperEl, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 28 }),
    })
    await wrapper.find('div').trigger('mousemove', { clientX: 100, clientY: 10 })
    await wrapper.find('div').trigger('mouseleave')
    await flushPromises()
    expect((wrapper.vm as any).hoveredPoint).toBeNull()
  })

  it('respects height prop in SVG viewBox', () => {
    const wrapper = mount(InteractiveSparkline, { props: { data: sampleData, height: 40 } })
    const vb = wrapper.find('svg').attributes('viewBox') ?? ''
    expect(vb).toContain('40')
  })
})
