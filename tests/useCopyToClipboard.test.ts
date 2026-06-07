import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCopyToClipboard } from '@/composables/useCopyToClipboard'

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('copied is false initially', () => {
    const { copied } = useCopyToClipboard()
    expect(copied.value).toBe(false)
  })

  it('sets copied to true after copy', async () => {
    const { copy, copied } = useCopyToClipboard()
    await copy('hello')
    expect(copied.value).toBe(true)
  })

  it('writes the correct text to the clipboard', async () => {
    const { copy } = useCopyToClipboard()
    await copy('my-token-123')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my-token-123')
  })

  it('resets copied to false after default 2000ms', async () => {
    const { copy, copied } = useCopyToClipboard()
    await copy('hello')
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1999)
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(copied.value).toBe(false)
  })

  it('respects a custom reset delay', async () => {
    const { copy, copied } = useCopyToClipboard(500)
    await copy('hello')
    vi.advanceTimersByTime(499)
    expect(copied.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(copied.value).toBe(false)
  })

  // The execCommand fallback path requires a real browser environment — not testable in JSDOM.
})
