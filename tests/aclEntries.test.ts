import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { normalizePublicKey, withAclRole } from '@/utils/aclRoles'

const api = {
  setACLPermissions: vi.fn(),
  removeACLClient: vi.fn(),
  getACLInfo: vi.fn(),
  getACLClients: vi.fn(),
  getACLStats: vi.fn(),
}

vi.mock('@/utils/api', () => ({ default: api }))

const KEY = '87b98e21e7858c0b74da819fdd40507df5f4e6cd38c798d27f1ef888a4e4c922'
const OTHER = 'aa'.repeat(32)

describe('removeACLClient', () => {
  it('refuses a call that names no identity, which would clear every ACL', async () => {
    const { default: RealApi } = await vi.importActual<typeof import('@/utils/api')>('@/utils/api')
    await expect(RealApi.removeACLClient({ public_key: KEY })).rejects.toThrow('identity_name')
  })
})

describe('ACL role helpers', () => {
  it('accepts a pasted key with a 0x prefix, spaces and colons', () => {
    expect(normalizePublicKey(`  0x${KEY.slice(0, 8).toUpperCase()} ${KEY.slice(8)} `)).toBe(KEY)
    expect(normalizePublicKey(KEY.match(/../g)!.join(':'))).toBe(KEY)
  })

  it('rejects anything but a full key', () => {
    expect(normalizePublicKey(KEY.slice(0, 62))).toBeNull()
    expect(normalizePublicKey(KEY + 'ab')).toBeNull()
    expect(normalizePublicKey('zz' + KEY.slice(2))).toBeNull()
  })

  it('replaces the role and keeps the upper bits', () => {
    expect(withAclRole(0x81, 3)).toBe(0x83)
    expect(withAclRole(0x03, 2)).toBe(0x02)
    expect(withAclRole(0, 1)).toBe(0x01)
    expect(withAclRole(undefined, 1)).toBe(0x01)
  })
})

function entry(overrides: Record<string, unknown> = {}) {
  return {
    public_key: `${KEY.slice(0, 16)}...${KEY.slice(-8)}`,
    public_key_full: KEY,
    address: '1e',
    permissions: 'admin',
    permissions_value: 0x83,
    persisted: true,
    last_activity: 0,
    identity_name: 'repeater',
    identity_type: 'repeater',
    identity_hash: '0xA9',
    ...overrides,
  }
}

describe('AclEntryModal', () => {
  beforeEach(() => {
    api.setACLPermissions.mockReset()
  })

  async function open(props: Record<string, unknown> = {}) {
    const { default: AclEntryModal } = await import('@/components/modals/AclEntryModal.vue')
    return mount(AclEntryModal, {
      props: {
        show: true,
        identities: [
          { name: 'repeater', type: 'repeater' },
          { name: 'General', type: 'room_server' },
        ],
        entries: [],
        initialIdentity: 'repeater',
        ...props,
      },
      global: { stubs: { Teleport: true, Spinner: true } },
      attachTo: document.body,
    })
  }

  it('makes the operator choose an identity rather than picking one', async () => {
    const wrapper = await open({ initialIdentity: 'gone' })
    expect((wrapper.find('#acl-identity').element as HTMLSelectElement).value).toBe('')
    await wrapper.find('#acl-pubkey').setValue(OTHER)
    await wrapper.find('#acl-role').setValue('3')
    await wrapper.find('form').trigger('submit')
    expect(api.setACLPermissions).not.toHaveBeenCalled()
    expect(wrapper.find('#acl-identity-error').text()).toContain('Choose the identity')
    wrapper.unmount()
  })

  it('selects the only identity there is', async () => {
    const wrapper = await open({
      initialIdentity: null,
      identities: [{ name: 'repeater', type: 'repeater' }],
    })
    expect((wrapper.find('#acl-identity').element as HTMLSelectElement).value).toBe('repeater')
    wrapper.unmount()
  })

  it('requires a role to be chosen, and says so on submit', async () => {
    const wrapper = await open()
    expect((wrapper.find('#acl-role').element as HTMLSelectElement).selectedIndex).toBe(0)
    await wrapper.find('#acl-pubkey').setValue(OTHER)
    // Submit stays enabled so Enter always gets an answer.
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    expect(api.setACLPermissions).not.toHaveBeenCalled()
    expect(wrapper.find('#acl-role-help').text()).toContain('Choose the role')
    expect(wrapper.find('#acl-role').attributes('aria-invalid')).toBe('true')
    wrapper.unmount()
  })

  it('reports a failed request', async () => {
    api.setACLPermissions.mockRejectedValue(new Error('Network error - no response received'))
    const wrapper = await open()
    await wrapper.find('#acl-pubkey').setValue(OTHER)
    await wrapper.find('#acl-role').setValue('3')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('Network error')
    wrapper.unmount()
  })

  it('sends the normalised key, identity and chosen role', async () => {
    api.setACLPermissions.mockResolvedValue({ success: true, message: 'Entry saved' })
    const wrapper = await open()

    await wrapper.find('#acl-pubkey').setValue(`0x${OTHER.toUpperCase()}`)
    await wrapper.find('#acl-role').setValue('2')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.setACLPermissions).toHaveBeenCalledWith({
      identity_name: 'repeater',
      client_pubkey: OTHER,
      permissions: 2,
    })
    expect(wrapper.emitted('saved')?.[0]).toEqual(['Entry saved'])
    wrapper.unmount()
  })

  it('keeps the upper bits of a key that is already listed', async () => {
    api.setACLPermissions.mockResolvedValue({ success: true })
    const wrapper = await open({ entries: [entry()] })

    await wrapper.find('#acl-pubkey').setValue(KEY)
    expect(wrapper.text()).toContain('Already listed as Admin')
    await wrapper.find('#acl-role').setValue('1')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.setACLPermissions.mock.calls[0]![0].permissions).toBe(0x81)
    wrapper.unmount()
  })

  it('does not submit a partial key and says why', async () => {
    const wrapper = await open()
    await wrapper.find('#acl-pubkey').setValue(KEY.slice(0, 10))
    await wrapper.find('#acl-role').setValue('3')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.setACLPermissions).not.toHaveBeenCalled()
    expect(wrapper.find('#acl-pubkey-help').text()).toContain('64 hex characters')
    wrapper.unmount()
  })

  it('warns that a room server keeps only admins across restarts', async () => {
    const wrapper = await open({ initialIdentity: 'General' })
    await wrapper.find('#acl-role').setValue('3')
    expect(wrapper.text()).not.toContain('keep only admins')
    await wrapper.find('#acl-role').setValue('2')
    expect(wrapper.text()).toContain('Room servers keep only admins')
    wrapper.unmount()
  })

  it('shows the backend error and stays open', async () => {
    api.setACLPermissions.mockResolvedValue({ success: false, error: 'the access list is full' })
    const wrapper = await open()
    await wrapper.find('#acl-pubkey').setValue(OTHER)
    await wrapper.find('#acl-role').setValue('3')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('full')
    expect(wrapper.emitted('saved')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes on Escape, but not while saving', async () => {
    let resolve!: (v: unknown) => void
    api.setACLPermissions.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = await open()
    await flushPromises()
    expect(document.activeElement?.id).toBe('acl-pubkey')

    await wrapper.find('#acl-pubkey').setValue(OTHER)
    await wrapper.find('#acl-role').setValue('3')
    await wrapper.find('form').trigger('submit')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.find('.modal-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    resolve({ success: false, error: 'x' })
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('Sessions access list', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockReset()
    api.getACLInfo.mockResolvedValue({
      success: true,
      data: {
        acls: [
          { name: 'repeater', type: 'repeater', acl_entries: 1, stored_entries: 1 },
          { name: 'General', type: 'room_server', acl_entries: 1, stored_entries: 1 },
        ],
      },
    })
    api.getACLStats.mockResolvedValue({ success: true, data: {} })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  async function mountWith(clients: unknown[]) {
    api.getACLClients.mockResolvedValue({ success: true, data: { clients } })
    const { default: Sessions } = await import('@/views/Sessions.vue')
    const wrapper = mount(Sessions, { global: { stubs: { Spinner: true } }, attachTo: document.body })
    await flushPromises()
    const tab = wrapper.findAll('button').find((b) => b.text() === 'Access List')!
    await tab.trigger('click')
    return wrapper
  }

  it('changes a role keeping the upper bits', async () => {
    api.setACLPermissions.mockResolvedValue({ success: true, message: 'Entry saved' })
    const wrapper = await mountWith([entry()])

    await wrapper.find('tbody select').setValue('2')
    await flushPromises()

    expect(api.setACLPermissions).toHaveBeenCalledWith({
      identity_name: 'repeater',
      client_pubkey: KEY,
      permissions: 0x82,
    })
    wrapper.unmount()
  })

  it('puts the stored role back when a change fails', async () => {
    api.setACLPermissions.mockResolvedValue({ success: false, error: 'disk full' })
    const wrapper = await mountWith([entry()])
    const select = wrapper.find('tbody select')

    await select.setValue('1')
    await flushPromises()

    expect((select.element as HTMLSelectElement).value).toBe('3')
    expect(document.body.textContent).toContain('Could not change the role: disk full')
    wrapper.unmount()
  })

  it('asks before making a saved room admin temporary', async () => {
    api.setACLPermissions.mockResolvedValue({ success: true })
    const wrapper = await mountWith([
      entry({ identity_name: 'General', identity_type: 'room_server' }),
    ])
    const select = wrapper.find('tbody select')

    await select.setValue('2')
    await flushPromises()
    expect(api.setACLPermissions).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('keeps only admins after a restart')

    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!
    cancel.click()
    await flushPromises()
    expect((select.element as HTMLSelectElement).value).toBe('3')
    wrapper.unmount()
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => (resolve = r))
    return { promise, resolve }
  }

  function confirmButton(label: string) {
    return [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label && b.className.includes('modal-btn-confirm'),
    )!
  }

  it('still manages the list when only the summary counts fail', async () => {
    api.getACLStats.mockResolvedValue({ success: false, error: 'stats broke' })
    const wrapper = await mountWith([entry()])
    expect(wrapper.find('tbody select').exists()).toBe(true)
    expect(document.body.textContent).not.toContain('stats broke')
    wrapper.unmount()
  })

  it('does not start a second change on a row that is still saving', async () => {
    const pending = deferred<unknown>()
    api.setACLPermissions.mockReturnValue(pending.promise)
    const wrapper = await mountWith([entry()])
    const select = wrapper.find('tbody select')

    await select.setValue('2')
    ;(select.element as HTMLSelectElement).value = '1'
    select.element.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(api.setACLPermissions).toHaveBeenCalledTimes(1)
    pending.resolve({ success: true })
    await flushPromises()
    wrapper.unmount()
  })

  it('keeps a removed row disabled until the list has reloaded', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])
    const refresh = deferred<unknown>()
    api.getACLClients.mockReturnValue(refresh.promise)

    await wrapper.find('button[aria-label^="Remove"]').trigger('click')
    await flushPromises()
    confirmButton('Remove').click()
    await flushPromises()

    // A role change here would recreate the entry just removed.
    expect((wrapper.find('tbody select').element as HTMLSelectElement).disabled).toBe(true)
    refresh.resolve({ success: true, data: { clients: [] } })
    await flushPromises()
    wrapper.unmount()
  })

  it('leaves focus in a dialog opened while an earlier removal refreshed', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const second = entry({
      public_key_full: OTHER,
      public_key: `${OTHER.slice(0, 16)}...${OTHER.slice(-8)}`,
    })
    const wrapper = await mountWith([entry(), second])
    const refresh = deferred<unknown>()
    api.getACLClients.mockReturnValue(refresh.promise)

    const removes = wrapper.findAll('button[aria-label^="Remove"]')
    ;(removes[0]!.element as HTMLElement).focus()
    await removes[0]!.trigger('click')
    await flushPromises()
    confirmButton('Remove').click()
    await flushPromises()
    ;(removes[1]!.element as HTMLElement).focus()
    await removes[1]!.trigger('click')
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel')

    refresh.resolve({ success: true, data: { clients: [second] } })
    await flushPromises()
    // Still in the second confirmation, not on a background control.
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel')
    wrapper.unmount()
  })

  it('puts focus somewhere useful after a confirmed removal', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])
    const remove = wrapper.find('button[aria-label^="Remove"]')
    ;(remove.element as HTMLElement).focus()
    await remove.trigger('click')
    await flushPromises()
    // The least destructive choice has focus in the confirmation.
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel')

    api.getACLClients.mockResolvedValue({ success: true, data: { clients: [] } })
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Remove' && b.className.includes('modal-btn-confirm'),
    )!
    confirm.click()
    await flushPromises()
    // The row is gone, so focus goes to Add entry rather than the page body.
    expect(document.activeElement?.textContent?.trim()).toBe('Add entry')
    wrapper.unmount()
  })

  it('puts focus on the identity filter after a removal on the By Identity tab', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])
    await wrapper.findAll('button').find((b) => b.text() === 'By Identity')!.trigger('click')
    const remove = wrapper.find('button[aria-label^="Remove"]')
    ;(remove.element as HTMLElement).focus()
    await remove.trigger('click')
    await flushPromises()

    api.getACLClients.mockResolvedValue({ success: true, data: { clients: [] } })
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Remove' && b.className.includes('modal-btn-confirm'))!
      .click()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.find('select').element)
    wrapper.unmount()
  })

  it('keeps Tab inside an open dialog', async () => {
    const wrapper = await mountWith([entry()])
    await wrapper.find('button[aria-label^="Remove"]').trigger('click')
    await flushPromises()
    const buttons = [...document.querySelectorAll<HTMLElement>('[role="alertdialog"] button')]
    buttons[buttons.length - 1]!.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(document.activeElement).toBe(buttons[0])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
    // Focus that has left the dialog is brought back in either direction.
    ;(document.body as HTMLElement).focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(document.activeElement).toBe(buttons[0])
    wrapper.unmount()
  })

  it('keeps focus on the page when the refresh after a removal fails', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])
    await wrapper.find('button[aria-label^="Remove"]').trigger('click')
    await flushPromises()

    api.getACLClients.mockRejectedValue(new Error('offline'))
    ;[...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Remove' && b.className.includes('modal-btn-confirm'))!
      .click()
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('Access List')
    wrapper.unmount()
  })

  it('shows an error rather than a stale list when a read answers success: false', async () => {
    api.getACLClients.mockResolvedValue({ success: false, error: 'database is locked' })
    const { default: Sessions } = await import('@/views/Sessions.vue')
    const wrapper = mount(Sessions, { global: { stubs: { Spinner: true } }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.text()).toContain('database is locked')
    // No counts from a read that failed, or from an earlier one.
    expect(wrapper.text()).not.toContain('Access List Entries')
    wrapper.unmount()
  })

  it('keeps focus on the page when the refresh after a direct role change fails', async () => {
    api.setACLPermissions.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])
    const select = wrapper.find('tbody select')
    ;(select.element as HTMLElement).focus()
    api.getACLClients.mockRejectedValue(new Error('offline'))
    await select.setValue('2')
    await flushPromises()
    expect(document.activeElement?.textContent?.trim()).toBe('Access List')
    wrapper.unmount()
  })

  it("shows a client's advertised name above its key", async () => {
    const wrapper = await mountWith([entry({ client_name: 'Howl 👾', client_type: 'Chat Node' })])
    const cell = wrapper.find('tbody td')
    expect(cell.text()).toContain('Howl 👾')
    expect(cell.text()).toContain(KEY.slice(0, 16))
    expect(cell.text()).not.toContain('Address')
    expect(wrapper.find('button[aria-label^="Remove"]').attributes('aria-label')).toContain('Howl 👾')
    wrapper.unmount()
  })

  it('removes by identity name after confirmation', async () => {
    api.removeACLClient.mockResolvedValue({ success: true })
    const wrapper = await mountWith([entry()])

    await wrapper.find('button[aria-label^="Remove"]').trigger('click')
    await flushPromises()
    const confirm = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Remove' && b.className.includes('modal-btn-confirm'),
    )!
    confirm.click()
    await flushPromises()

    expect(api.removeACLClient).toHaveBeenCalledWith({
      public_key: KEY,
      identity_name: 'repeater',
      identity_hash: '0xA9',
    })
    wrapper.unmount()
  })
})
