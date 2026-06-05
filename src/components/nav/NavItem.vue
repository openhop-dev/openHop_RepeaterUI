<script setup lang="ts">
import { computed, ref, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { NavItemConfig } from '@/config/navigation'
import { NAV_ACTION_HANDLERS_KEY } from '@/config/navActionHandlers'
import { ChevronDown } from '@lucide/vue'

defineOptions({ name: 'NavItem' })

const props = defineProps<{
  item: NavItemConfig
  depth?: number
  precedesActive?: boolean
}>()

const route = useRoute()
const router = useRouter()

const depth = computed(() => props.depth ?? 0)

const actionHandlers = inject<Record<string, () => void>>(NAV_ACTION_HANDLERS_KEY, {})

// ── Active state ──────────────────────────────────────────────────────────────

function matchesActive(cfg: NavItemConfig, currentPath: string, currentQuery: Record<string, string>): boolean {
  const targets = cfg.activeOn ?? (cfg.route ? [cfg.route] : [])
  if (targets.length === 0) return false
  if (!targets.some((t) => currentPath === t || currentPath.startsWith(t + '/'))) return false
  if (cfg.params && !cfg.children) {
    return Object.entries(cfg.params).every(([k, v]) => currentQuery[k] === v)
  }
  return true
}

function anyChildActive(items: NavItemConfig[], currentPath: string, currentQuery: Record<string, string>): boolean {
  return items.some((child) =>
    child.children
      ? anyChildActive(child.children, currentPath, currentQuery)
      : matchesActive(child, currentPath, currentQuery),
  )
}

const isActive = computed(() => {
  if (props.item.children) return false
  return matchesActive(props.item, route.path, route.query as Record<string, string>)
})

const hasActiveDescendant = computed(() =>
  !!props.item.children && anyChildActive(props.item.children, route.path, route.query as Record<string, string>),
)

// Index of the first child that is active or contains the active item.
// Children before this index receive the 'precedesActive' prop.
const activeChildIndex = computed(() => {
  if (!props.item.children) return -1
  return props.item.children.findIndex((child) =>
    child.children
      ? anyChildActive(child.children, route.path, route.query as Record<string, string>)
      : matchesActive(child, route.path, route.query as Record<string, string>),
  )
})

// ── Expand / collapse ─────────────────────────────────────────────────────────

const isGroup = computed(() => !!props.item.children?.length)
const expanded = ref(false)

watch(
  hasActiveDescendant,
  (active) => { if (active) expanded.value = true },
  { immediate: true },
)

function toggle() { expanded.value = !expanded.value }

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate() {
  if (!props.item.route) return
  const query = props.item.params ? { ...props.item.params } : undefined
  router.push({ path: props.item.route, query })
}

function handleClick() {
  if (isGroup.value) toggle()
  else if (props.item.action) actionHandlers[props.item.action]?.()
  else navigate()
}

// ── Styles ────────────────────────────────────────────────────────────────────

const isChild = computed(() => depth.value > 0)

const buttonClass = computed(() => {
  const py = isChild.value ? 'py-2' : 'py-3'
  const base = `w-full rounded-[10px] ${py} flex items-center gap-2 text-sm font-medium transition-all duration-200`
  const indent = isChild.value ? 'pl-2 pr-2' : 'pl-4 pr-2'

  if (isActive.value) {
    return `${base} ${indent} text-primary font-semibold border border-transparent`
  }
  return `${base} ${indent} text-content-primary dark:text-content-primary hover:text-primary border border-transparent`
})

const iconClass = computed(() =>
  isActive.value
    ? 'w-3.5 h-3.5 flex-shrink-0 text-primary'
    : 'w-3.5 h-3.5 flex-shrink-0 text-content-muted',
)
</script>

<template>
  <div :class="{
    'nav-item-active':    isActive,
    'nav-has-active':     hasActiveDescendant,
    'nav-precedes-active': props.precedesActive,
  }">
    <span v-if="isChild" class="nav-tick" aria-hidden="true" />
    <button :class="buttonClass" @click="handleClick">
      <component :is="item.icon" v-if="item.icon" :class="iconClass" />
      <span class="nav-label flex-1 text-left">{{ item.label }}</span>
      <ChevronDown
        v-if="isGroup"
        :class="['w-3 h-3 flex-shrink-0 transition-transform duration-200 text-content-muted', expanded ? 'rotate-180' : '']"
      />
    </button>

    <Transition name="nav-expand">
      <div
        v-if="isGroup && expanded"
        :class="['nav-children mt-0 space-y-0', depth === 0 ? 'nav-root-children ml-[23px]' : 'nav-nested-children ml-[15px]']"
      >
        <NavItem
          v-for="(child, i) in item.children"
          :key="child.id"
          :item="child"
          :depth="depth + 1"
          :precedes-active="activeChildIndex >= 0 && i < activeChildIndex"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.nav-expand-enter-active,
.nav-expand-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
  transform-origin: top;
}
.nav-expand-enter-from,
.nav-expand-leave-to {
  opacity: 0;
  transform: scaleY(0.95) translateY(-4px);
}

/* ── Tree lines ──────────────────────────────────────────────────────────────
 * Layer 1 (div::before): subtle structural guide — always full height, never removed.
 * Layer 2 (div::after):  primary overlay — only on the active path, no :has() needed.
 * Tick (.nav-tick span):  real DOM element so positioning is unambiguous.
 *
 * Three roles, identified by class on the child div's root:
 *   nav-item-active     — the selected leaf. Overlay stops at tick (18px).
 *   nav-has-active      — an ancestor of the selected leaf. Also stops at tick.
 *   nav-precedes-active — a sibling before the active/has-active child. Full height.
 *
 * py-2 child button: 8 + 20 + 8 = 36px → centre = 18px
 */

.nav-children > div { position: relative; }

/* ── Layer 1: subtle structural guide ── */
.nav-children > div::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 1px;
  background: var(--color-border-subtle);
}
.nav-root-children   > div:first-child::before { top: -10px; }
.nav-nested-children > div:first-child::before { top: -8px; }
.nav-children        > div:last-child::before  { bottom: calc(100% - 18px); }

/* ── Layer 2: primary overlay ── */

/* Active leaf — stops at tick */
.nav-children > .nav-item-active::after {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: calc(100% - 18px);
  width: 1px;
  background: var(--color-primary);
}

/* Active ancestor — stops at tick, same as active leaf */
.nav-children > .nav-has-active::after {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: calc(100% - 18px);
  width: 1px;
  background: var(--color-primary);
}

/* Preceding sibling — full height (path continues through it) */
.nav-children > .nav-precedes-active::after {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 1px;
  background: var(--color-primary);
}

/* First-child extensions — reach up into the parent button space */
.nav-nested-children > div:first-child.nav-item-active::after,
.nav-nested-children > div:first-child.nav-has-active::after,
.nav-nested-children > div:first-child.nav-precedes-active::after { top: -8px; }
.nav-root-children   > div:first-child.nav-item-active::after,
.nav-root-children   > div:first-child.nav-has-active::after,
.nav-root-children   > div:first-child.nav-precedes-active::after { top: -10px; }

/* ── Hover glow — text only ──
 * Intensity is set per mode via --nav-hover-*-shadow tokens in base.css.
 */
button:hover .nav-label { text-shadow: var(--nav-hover-label-shadow); }
button:hover svg        { filter: var(--nav-hover-icon-shadow); }

/* ── Tick ── */
.nav-tick {
  position: absolute;
  left: 0; top: 18px;
  width: 4px; height: 1px;
  pointer-events: none;
  background: var(--color-border-subtle);
}
/* Selected leaf and its ancestors get a primary tick */
.nav-item-active > .nav-tick,
.nav-has-active > .nav-tick {
  background: var(--color-primary);
}
</style>
