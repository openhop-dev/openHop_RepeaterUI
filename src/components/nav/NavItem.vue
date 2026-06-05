<script setup lang="ts">
import { computed, ref, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { NavItemConfig } from '@/config/navigation'
import { NAV_ACTION_HANDLERS_KEY } from '@/config/navActionHandlers'

import ConfigurationsIcon from '@/components/icons/configurations.vue'
import DashboardIcon from '@/components/icons/dashboard.vue'
import HelpIcon from '@/components/icons/help.vue'
import LogsIcon from '@/components/icons/logs.vue'
import TerminalIcon from '@/components/icons/terminal.vue'
import StatsIcon from '@/components/icons/stats.vue'
import SystemIcon from '@/components/icons/system.vue'
import NeighborsIcon from '@/components/icons/neighbors.vue'
import GpsIcon from '@/components/icons/gps.vue'

defineOptions({ name: 'NavItem' })

const props = defineProps<{ item: NavItemConfig; depth?: number }>()

const route = useRoute()
const router = useRouter()

const depth = computed(() => props.depth ?? 0)

// ── Icon map ─────────────────────────────────────────────────────────────────

const actionHandlers = inject<Record<string, () => void>>(NAV_ACTION_HANDLERS_KEY, {})

const iconComponents: Record<string, unknown> = {
  dashboard: DashboardIcon,
  neighbors: NeighborsIcon,
  statistics: StatsIcon,
  gps: GpsIcon,
  sensors: SystemIcon,
  'system-stats': SystemIcon,
  sessions: SystemIcon,
  configuration: ConfigurationsIcon,
  'room-servers': ConfigurationsIcon,
  companions: ConfigurationsIcon,
  logs: LogsIcon,
  terminal: TerminalIcon,
  help: HelpIcon,
}

// ── Active state ──────────────────────────────────────────────────────────────

function matchesActive(cfg: NavItemConfig, currentPath: string, currentQuery: Record<string, string>): boolean {
  const targets = cfg.activeOn ?? (cfg.route ? [cfg.route] : [])
  if (targets.length === 0) return false
  if (!targets.some((t) => currentPath === t || currentPath.startsWith(t + '/'))) return false

  // If this leaf specifies params, every param must match the current query.
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

// True only for leaf items whose route+params exactly match the current location.
// This is the only thing that drives the blue highlight style.
const isActive = computed(() => {
  if (props.item.children) return false
  return matchesActive(props.item, route.path, route.query as Record<string, string>)
})

// True for group items that contain an active descendant — used only for auto-expand.
const hasActiveDescendant = computed(() =>
  !!props.item.children && anyChildActive(props.item.children, route.path, route.query as Record<string, string>),
)

// ── Expand / collapse ─────────────────────────────────────────────────────────

const isGroup = computed(() => !!props.item.children?.length)
const expanded = ref(false)

// Auto-expand when a descendant becomes active (page load, route change).
watch(
  hasActiveDescendant,
  (active) => { if (active) expanded.value = true },
  { immediate: true },
)

function toggle() {
  expanded.value = !expanded.value
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate() {
  if (!props.item.route) return
  const query = props.item.params ? { ...props.item.params } : undefined
  router.push({ path: props.item.route, query })
}

function handleClick() {
  if (isGroup.value) {
    toggle()
  } else if (props.item.action) {
    actionHandlers[props.item.action]?.()
  } else {
    navigate()
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const isChild = computed(() => depth.value > 0)

const buttonClass = computed(() => {
  const base = 'w-full rounded-[10px] py-3 flex items-center gap-3 text-sm font-medium transition-all duration-200'
  const indent = isChild.value ? 'px-3' : 'px-4'

  if (isActive.value) {
    return `${base} ${indent} bg-primary/20 text-primary border border-primary/40 font-semibold`
  }

  return `${base} ${indent} text-content-primary dark:text-content-primary hover:bg-primary/10 hover:text-primary hover:border-primary/20 border border-transparent`
})

const iconClass = computed(() =>
  isActive.value
    ? 'w-3.5 h-3.5 text-primary [&_path]:fill-current flex-shrink-0'
    : 'w-3.5 h-3.5 text-content-primary dark:text-content-primary [&_path]:fill-current flex-shrink-0',
)
</script>

<template>
  <div>
    <button :class="buttonClass" @click="handleClick">
      <component
        :is="iconComponents[item.icon ?? '']"
        v-if="item.icon && iconComponents[item.icon]"
        :class="iconClass"
      />
      <span class="flex-1 text-left">{{ item.label }}</span>
      <!-- Chevron for groups -->
      <svg
        v-if="isGroup"
        :class="[
          'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 text-content-muted',
          expanded ? 'rotate-180' : '',
        ]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Children -->
    <Transition name="nav-expand">
      <div
        v-if="isGroup && expanded"
        class="mt-1 ml-3 pl-3 border-l border-stroke-subtle dark:border-stroke/30 space-y-1"
      >
        <NavItem
          v-for="child in item.children"
          :key="child.id"
          :item="child"
          :depth="depth + 1"
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
</style>
