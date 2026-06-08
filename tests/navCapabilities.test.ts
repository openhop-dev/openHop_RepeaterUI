import { describe, it, expect } from 'vitest'
import { navigationItems, knownCapabilities } from '@/config/navigation'
import type { NavItemConfig } from '@/config/navigation'

function collectEnabledWhen(items: NavItemConfig[]): string[] {
  const found: string[] = []
  for (const item of items) {
    if (item.enabledWhen) found.push(item.enabledWhen)
    if (item.children) found.push(...collectEnabledWhen(item.children))
  }
  return found
}

describe('nav capability guard', () => {
  it('every enabledWhen value in the nav config is registered in knownCapabilities', () => {
    const used = collectEnabledWhen(navigationItems)
    const known = new Set<string>(knownCapabilities)

    for (const cap of used) {
      expect(
        known.has(cap),
        `Nav item uses enabledWhen: '${cap}' but '${cap}' is not in knownCapabilities.\n` +
        `Add it to knownCapabilities in navigation.ts and register its resolver in Sidebar.vue.`,
      ).toBe(true)
    }
  })

  it('knownCapabilities has no duplicate entries', () => {
    const seen = new Set<string>()
    for (const cap of knownCapabilities) {
      expect(seen.has(cap), `Duplicate capability key: '${cap}'`).toBe(false)
      seen.add(cap)
    }
  })
})
