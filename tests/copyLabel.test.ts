import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CopyLabel from '@/components/ui/CopyLabel.vue'

describe('CopyLabel', () => {
  describe('default label ("Copy" / "Copied!")', () => {
    it('shows default label when not copied', () => {
      const wrapper = mount(CopyLabel, { props: { copied: false } })
      const visible = wrapper.findAll('span').filter(s => !s.classes('invisible'))
      expect(visible.some(s => s.text() === 'Copy')).toBe(true)
    })

    it('shows confirmed label when copied', () => {
      const wrapper = mount(CopyLabel, { props: { copied: true } })
      const visible = wrapper.findAll('span').filter(s => !s.classes('invisible'))
      expect(visible.some(s => s.text() === 'Copied!')).toBe(true)
    })

    it('sizer uses confirmed label when it is longer', () => {
      // "Copied!" (7) > "Copy" (4) so sizer shows confirmed
      const wrapper = mount(CopyLabel, { props: { copied: false } })
      const sizer = wrapper.find('span.invisible')
      expect(sizer.text()).toBe('Copied!')
    })
  })

  describe('custom label ("Copy Key" / "Copied!")', () => {
    it('shows custom default label when not copied', () => {
      const wrapper = mount(CopyLabel, { props: { copied: false, label: 'Copy Key' } })
      const visible = wrapper.findAll('span').filter(s => !s.classes('invisible'))
      expect(visible.some(s => s.text() === 'Copy Key')).toBe(true)
    })

    it('shows confirmed label when copied', () => {
      const wrapper = mount(CopyLabel, { props: { copied: true, label: 'Copy Key' } })
      const visible = wrapper.findAll('span').filter(s => !s.classes('invisible'))
      expect(visible.some(s => s.text() === 'Copied!')).toBe(true)
    })

    it('sizer uses default label when it is longer', () => {
      // "Copy Key" (8) > "Copied!" (7) so sizer shows default
      const wrapper = mount(CopyLabel, { props: { copied: false, label: 'Copy Key' } })
      const sizer = wrapper.find('span.invisible')
      expect(sizer.text()).toBe('Copy Key')
    })
  })

  describe('custom confirmed label', () => {
    it('shows custom confirmed text when copied', () => {
      const wrapper = mount(CopyLabel, {
        props: { copied: true, label: 'Copy', confirmed: 'Done!' },
      })
      const visible = wrapper.findAll('span').filter(s => !s.classes('invisible'))
      expect(visible.some(s => s.text() === 'Done!')).toBe(true)
    })
  })

  describe('sizer is always present', () => {
    it('sizer span is always in the DOM regardless of copied state', async () => {
      const wrapper = mount(CopyLabel, { props: { copied: false } })
      expect(wrapper.find('span.invisible').exists()).toBe(true)
      await wrapper.setProps({ copied: true })
      expect(wrapper.find('span.invisible').exists()).toBe(true)
    })

    it('sizer has aria-hidden so screen readers ignore it', () => {
      const wrapper = mount(CopyLabel, { props: { copied: false } })
      expect(wrapper.find('span.invisible').attributes('aria-hidden')).toBe('true')
    })
  })
})
