import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent } from 'vue'

// Mock authClient so onMounted's site_info call does not make real HTTP requests.
vi.mock('@/utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/api')>()
  return {
    ...actual,
    authClient: {
      get: vi.fn().mockResolvedValue({ data: { success: true, site_name: 'Test' } }),
      post: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
})

describe('Login form — iOS autofill contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('form has action="/" so non-Safari iOS browsers recognise it as a login form', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: defineComponent({ template: '<div/>' }) },
        { path: '/', component: defineComponent({ template: '<div/>' }) },
      ],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: {
          ChangePasswordModal: true,
          ThemeToggle: true,
          GitHubIcon: true,
          CoffeeIcon: true,
          Spinner: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('form').attributes('action')).toBe('/')
  })

  it('username input has autocomplete="username"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: { ChangePasswordModal: true, ThemeToggle: true, GitHubIcon: true, CoffeeIcon: true, Spinner: true },
      },
    })
    await flushPromises()

    const usernameInput = wrapper.find('input[name="username"]')
    expect(usernameInput.attributes('autocomplete')).toBe('username')
  })

  it('password input has autocomplete="current-password"', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/login', component: defineComponent({ template: '<div/>' }) }],
    })
    router.push('/login')
    await router.isReady()

    const { default: Login } = await import('@/views/Login.vue')
    const wrapper = mount(Login, {
      global: {
        plugins: [router],
        stubs: { ChangePasswordModal: true, ThemeToggle: true, GitHubIcon: true, CoffeeIcon: true, Spinner: true },
      },
    })
    await flushPromises()

    const passwordInput = wrapper.find('input[name="password"]')
    expect(passwordInput.attributes('autocomplete')).toBe('current-password')
  })
})
