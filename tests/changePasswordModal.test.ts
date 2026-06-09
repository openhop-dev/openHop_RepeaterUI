import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ChangePasswordModal from '@/components/modals/ChangePasswordModal.vue'

vi.mock('@/utils/api', () => ({
  authClient: {
    post: vi.fn(),
  },
}))

import { authClient } from '@/utils/api'

function mountModal(props = {}) {
  return mount(ChangePasswordModal, {
    props: { isOpen: true, ...props },
    global: { stubs: { Teleport: true, Spinner: true } },
  })
}

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { vi.restoreAllMocks() })

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ChangePasswordModal — rendering', () => {
  it('shows "Cancel" button when canSkip is false (TopBar context)', () => {
    const wrapper = mountModal({ canSkip: false })
    expect(wrapper.text()).toContain('Cancel')
    expect(wrapper.text()).not.toContain('Skip for Now')
  })

  it('shows "Skip for Now" button when canSkip is true (login context)', () => {
    const wrapper = mountModal({ canSkip: true })
    expect(wrapper.text()).toContain('Skip for Now')
    expect(wrapper.text()).not.toContain('Cancel')
  })

  it('shows neutral subtitle when canSkip is false', () => {
    const wrapper = mountModal({ canSkip: false })
    expect(wrapper.text()).toContain('Enter your current password')
  })

  it('shows default-password warning subtitle when canSkip is true', () => {
    const wrapper = mountModal({ canSkip: true })
    expect(wrapper.text()).toContain("You're using the default password")
  })

  it('does not render when isOpen is false', () => {
    const wrapper = mountModal({ isOpen: false })
    expect(wrapper.find('form').exists()).toBe(false)
  })
})

// ── Dismiss ───────────────────────────────────────────────────────────────────

describe('ChangePasswordModal — dismiss', () => {
  it('emits close when Cancel is clicked', async () => {
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('button[type="button"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when Skip for Now is clicked', async () => {
    const wrapper = mountModal({ canSkip: true })
    await wrapper.find('button[type="button"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('ChangePasswordModal — client-side validation', () => {
  it('shows error when new password is too short', async () => {
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('oldpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('short')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('short')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('at least 8 characters')
    expect(authClient.post).not.toHaveBeenCalled()
  })

  it('shows error when passwords do not match', async () => {
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('oldpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('newpassword1')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('newpassword2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('do not match')
    expect(authClient.post).not.toHaveBeenCalled()
  })

  it('shows error when new password equals current password', async () => {
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('samepassword')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('samepassword')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('samepassword')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('different from current')
    expect(authClient.post).not.toHaveBeenCalled()
  })
})

// ── API ───────────────────────────────────────────────────────────────────────

describe('ChangePasswordModal — API', () => {
  it('calls the correct endpoint with current and new password', async () => {
    vi.mocked(authClient.post).mockResolvedValue({ data: { success: true, message: 'Password changed successfully!' } })
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('currentpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('newpassword1')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(authClient.post).toHaveBeenCalledWith('/auth/change_password', {
      current_password: 'currentpass',
      new_password: 'newpassword1',
    })
  })

  it('shows success message and emits success then close on API success', async () => {
    vi.useFakeTimers()
    vi.mocked(authClient.post).mockResolvedValue({ data: { success: true, message: 'Password changed successfully!' } })
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('currentpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('newpassword1')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Password changed successfully')
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(wrapper.emitted('success')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
    vi.useRealTimers()
  })

  it('shows API error message on failure response', async () => {
    vi.mocked(authClient.post).mockResolvedValue({ data: { success: false, error: 'Current password is incorrect' } })
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('wrongpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('newpassword1')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Current password is incorrect')
    expect(wrapper.emitted('success')).toBeFalsy()
  })

  it('shows fallback error message on network error', async () => {
    vi.mocked(authClient.post).mockRejectedValue(
      Object.assign(new Error('Network error'), { response: { data: { error: 'Connection refused' } } })
    )
    const wrapper = mountModal({ canSkip: false })
    await wrapper.find('input[placeholder="Enter current password"]').setValue('currentpass')
    await wrapper.find('input[placeholder="Enter new password (min 8 characters)"]').setValue('newpassword1')
    await wrapper.find('input[placeholder="Confirm new password"]').setValue('newpassword1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Connection refused')
    expect(wrapper.emitted('success')).toBeFalsy()
  })
})
