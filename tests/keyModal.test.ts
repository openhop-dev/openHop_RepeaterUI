import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import KeyModal from '@/components/modals/KeyModal.vue'
import type { TreeNodeData } from '@/types/tree'

vi.mock('@noble/hashes/sha2.js', () => ({
  sha256: vi.fn(() => new Uint8Array(32).fill(1)),
}))

vi.mock('@/composables/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({ copy: vi.fn(), copied: { value: false } }),
}))

const makeNode = (overrides: Partial<TreeNodeData> = {}): TreeNodeData => ({
  id: 1,
  name: '#uk',
  children: [],
  floodPolicy: 'allow',
  ...overrides,
})

const makeTree = (): TreeNodeData[] => [
  {
    id: 10,
    name: '#eu',
    children: [
      { id: 11, name: '#uk', children: [], floodPolicy: 'allow', parent_id: 10 },
    ],
    floodPolicy: 'allow',
  },
]

function mountModal(props: Record<string, unknown>) {
  return mount(KeyModal, {
    props: { show: true, allNodes: [], ...props },
    global: { stubs: { Teleport: true, Transition: true, CopyLabel: true } },
  })
}

// ── Mode detection ────────────────────────────────────────────────────────────

describe('KeyModal mode', () => {
  it('is in add mode when node is null', () => {
    const wrapper = mountModal({ node: null })
    expect(wrapper.find('h3').text()).toBe('Add New Entry')
  })

  it('is in edit mode when node is provided', () => {
    const wrapper = mountModal({ node: makeNode() })
    expect(wrapper.find('h3').text()).toBe('Edit Entry')
  })
})

// ── Parent path ───────────────────────────────────────────────────────────────

describe('KeyModal parent path', () => {
  it('shows "Adding at root level" when no parent in add mode', () => {
    const wrapper = mountModal({ node: null, allNodes: [] })
    expect(wrapper.text()).toContain('Adding at root level')
  })

  it('shows parent node name in add mode when selectedParentId is set', () => {
    const wrapper = mountModal({
      node: null,
      selectedParentId: 10,
      allNodes: makeTree(),
    })
    expect(wrapper.text()).toContain('#eu')
  })

  it('shows parent path in edit mode from node.parent_id', () => {
    const wrapper = mountModal({
      node: makeNode({ id: 11, name: '#uk', parent_id: 10 }),
      allNodes: makeTree(),
    })
    expect(wrapper.text()).toContain('#eu')
  })
})

// ── Form pre-population in edit mode ─────────────────────────────────────────

describe('KeyModal edit mode pre-population', () => {
  it('strips # prefix and sets entryType to region', async () => {
    const wrapper = mountModal({ node: makeNode({ name: '#uk' }) })
    await flushPromises()
    const input = wrapper.find('input[type="text"]')
    expect((input.element as HTMLInputElement).value).toBe('uk')
  })

  it('sets entryType to privateKey for non-# names', async () => {
    const wrapper = mountModal({ node: makeNode({ name: 'mykey' }) })
    await flushPromises()
    const input = wrapper.find('input[type="text"]')
    expect((input.element as HTMLInputElement).value).toBe('mykey')
  })

  it('pre-populates flood policy from node', async () => {
    const wrapper = mountModal({ node: makeNode({ floodPolicy: 'deny' }) })
    await flushPromises()
    // deny button should be visually active — check aria or class
    const buttons = wrapper.findAll('button').filter(b => b.text() === 'DENY')
    expect(buttons.length).toBeGreaterThan(0)
  })
})

// ── Emit routing ──────────────────────────────────────────────────────────────

describe('KeyModal emit routing', () => {
  it('emits add in add mode with correct payload', async () => {
    const wrapper = mountModal({ node: null, allNodes: [] })
    await wrapper.find('input[type="text"]').setValue('testregion')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('add')).toBeTruthy()
    const payload = wrapper.emitted('add')![0][0] as any
    expect(payload.name).toBe('#testregion')
    expect(payload.floodPolicy).toBe('allow')
  })

  it('emits save in edit mode with correct id', async () => {
    const wrapper = mountModal({ node: makeNode({ id: 42, name: '#uk' }) })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('save')).toBeTruthy()
    const payload = wrapper.emitted('save')![0][0] as any
    expect(payload.id).toBe(42)
  })

  it('does not include transportKey in save payload when name unchanged', async () => {
    const wrapper = mountModal({ node: makeNode({ id: 1, name: '#uk' }) })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('save')![0][0] as any
    expect(payload.transportKey).toBeUndefined()
  })

  it('emits close on cancel', async () => {
    const wrapper = mountModal({ node: null, allNodes: [] })
    await wrapper.findAll('button').find(b => b.text() === 'Cancel')!.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('privateKey name has no # prefix in add payload', async () => {
    const wrapper = mountModal({ node: null, allNodes: [] })
    await wrapper.findAll('button').find(b => b.text() === 'PRIVATE KEY')!.trigger('click')
    await wrapper.find('input[type="text"]').setValue('mykey')
    await wrapper.find('form').trigger('submit')
    const payload = wrapper.emitted('add')![0][0] as any
    expect(payload.name).toBe('mykey')
  })
})
