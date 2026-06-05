import { describe, it, expect, vi } from 'vitest'
import { NAV_ACTION_HANDLERS_KEY } from '@/config/navActionHandlers'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import NavItem from '@/components/nav/NavItem.vue'
import type { NavItemConfig } from '@/config/navigation'

function makeRouter(path = '/', query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/configuration', component: { template: '<div/>' } },
      { path: '/neighbors', component: { template: '<div/>' } },
    ],
  })
  router.push({ path, query })
  return router
}

const leafItem: NavItemConfig = {
  id: 'neighbors',
  label: 'Neighbors',
  icon: 'neighbors',
  route: '/neighbors',
}

// Mirrors the 3-level structure in navigation.ts
const groupItem: NavItemConfig = {
  id: 'configuration',
  label: 'Configuration',
  icon: 'configuration',
  activeOn: ['/configuration'],
  children: [
    {
      id: 'config-radio',
      label: 'Radio',
      activeOn: ['/configuration'],
      children: [
        { id: 'config-radio-settings', label: 'Radio Settings', route: '/configuration', params: { tab: 'radio' },          activeOn: ['/configuration'] },
        { id: 'config-radio-hardware', label: 'Radio Hardware',  route: '/configuration', params: { tab: 'radio-hardware' }, activeOn: ['/configuration'] },
      ],
    },
    {
      id: 'config-maintenance',
      label: 'Maintenance',
      activeOn: ['/configuration'],
      children: [
        { id: 'config-backup', label: 'Backup', route: '/configuration', params: { tab: 'backup' }, activeOn: ['/configuration'] },
      ],
    },
  ],
}

// ── Leaf item ─────────────────────────────────────────────────────────────────

describe('NavItem — leaf', () => {
  it('renders the label', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: leafItem }, global: { plugins: [router] } })
    expect(wrapper.text()).toContain('Neighbors')
  })

  it('is not active when on a different route', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: leafItem }, global: { plugins: [router] } })
    expect(wrapper.find('button').classes().join(' ')).not.toContain('bg-primary/20')
  })

  it('is active when route matches', async () => {
    const router = makeRouter('/neighbors')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: leafItem }, global: { plugins: [router] } })
    expect(wrapper.find('button').classes().join(' ')).toContain('bg-primary/20')
  })

  it('navigates on click', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: leafItem }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/neighbors')
  })

  it('does not render a chevron', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: leafItem }, global: { plugins: [router] } })
    expect(wrapper.html()).not.toContain('M19 9l-7 7-7-7')
  })
})

// ── Action item ───────────────────────────────────────────────────────────────

describe('NavItem — action item', () => {
  it('calls the injected handler on click', async () => {
    const handler = vi.fn()
    const router = makeRouter('/')
    await router.isReady()
    const actionItem: NavItemConfig = { id: 'send-advert', label: 'Send Advert', action: 'sendAdvert' }
    const wrapper = mount(NavItem, {
      props: { item: actionItem },
      global: {
        plugins: [router],
        provide: { [NAV_ACTION_HANDLERS_KEY as unknown as string]: { sendAdvert: handler } },
      },
    })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    // Handler called; route must not have changed
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('does not navigate when action is set', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const actionItem: NavItemConfig = { id: 'send-advert', label: 'Send Advert', action: 'sendAdvert' }
    const wrapper = mount(NavItem, { props: { item: actionItem }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })
})

// ── 3-level group ─────────────────────────────────────────────────────────────

describe('NavItem — 3-level group', () => {
  it('renders only the top-level button when collapsed', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    expect(wrapper.findAll('button').length).toBe(1)
  })

  it('expands to show mid-level groups on click', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    // Top + Radio + Maintenance (leaf tabs not yet expanded)
    expect(wrapper.findAll('button').length).toBe(3)
  })

  it('collapses on second click', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('button').length).toBe(1)
  })

  it('auto-expands all levels when a leaf tab is active', async () => {
    const router = makeRouter('/configuration', { tab: 'radio' })
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await flushPromises()
    // Top + Radio + Radio Settings + Radio Hardware + Maintenance
    expect(wrapper.findAll('button').length).toBe(5)
  })

  it('highlights only the matching leaf — not the parent groups', async () => {
    const router = makeRouter('/configuration', { tab: 'backup' })
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const backupBtn = buttons.find((b) => b.text().includes('Backup'))
    expect(backupBtn).toBeDefined()
    expect(backupBtn!.classes().join(' ')).toContain('bg-primary/20')

    // Parent group buttons must NOT carry the active blue style
    const configBtn = buttons[0]
    expect(configBtn.classes().join(' ')).not.toContain('bg-primary/20')
    const maintenanceBtn = buttons.find((b) => b.text().includes('Maintenance'))
    expect(maintenanceBtn!.classes().join(' ')).not.toContain('bg-primary/20')
  })

  it('does not navigate when the group toggle is clicked', async () => {
    const router = makeRouter('/')
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('navigates with correct tab query param when a leaf is clicked', async () => {
    // Start on a radio tab so the Radio group auto-expands; click Radio Hardware
    const router = makeRouter('/configuration', { tab: 'radio' })
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await flushPromises()
    const hardwareBtn = wrapper.findAll('button').find((b) => b.text().includes('Radio Hardware'))
    expect(hardwareBtn).toBeDefined()
    await hardwareBtn!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/configuration')
    expect(router.currentRoute.value.query.tab).toBe('radio-hardware')
  })

  it('a non-matching tab param does not activate a leaf', async () => {
    const router = makeRouter('/configuration', { tab: 'memory' })
    await router.isReady()
    const wrapper = mount(NavItem, { props: { item: groupItem }, global: { plugins: [router] } })
    await flushPromises()
    // Radio Settings and Radio Hardware should not be active
    const radioSettingsBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Radio Settings')
    if (radioSettingsBtn) {
      expect(radioSettingsBtn.classes().join(' ')).not.toContain('bg-primary/15')
    }
  })
})

// ── Nav config shape ──────────────────────────────────────────────────────────

describe('navigation config shape', () => {
  it('every leaf item has a route or an action', async () => {
    const { navigationItems } = await import('@/config/navigation')
    function checkItems(items: NavItemConfig[]) {
      for (const item of items) {
        if (item.children?.length) {
          checkItems(item.children)
        } else {
          expect(
            item.route || item.action,
            `${item.id} must have a route or an action`,
          ).toBeTruthy()
        }
      }
    }
    checkItems(navigationItems)
  })

  it('every item has a unique id', async () => {
    const { navigationItems } = await import('@/config/navigation')
    const ids: string[] = []
    function collectIds(items: NavItemConfig[]) {
      for (const item of items) {
        ids.push(item.id)
        if (item.children) collectIds(item.children)
      }
    }
    collectIds(navigationItems)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every configuration leaf has a tab param', async () => {
    const { navigationItems } = await import('@/config/navigation')
    const system = navigationItems.find((s) => s.id === 'system')!
    const config = system.children!.find((i) => i.id === 'configuration')!
    function checkConfigLeaves(items: NavItemConfig[]) {
      for (const item of items) {
        if (item.children?.length) {
          checkConfigLeaves(item.children)
        } else {
          expect(item.params?.tab, `${item.id} must have a tab param`).toBeTruthy()
        }
      }
    }
    checkConfigLeaves(config.children!)
  })
})
