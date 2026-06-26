<script setup lang="ts">
import { computed, ref, provide, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NAV_ACTION_HANDLERS_KEY } from '@/config/navActionHandlers';
import { useSystemStore } from '@/stores/system';
import { usePacketStore } from '@/stores/packets';
import { useDataService } from '@/stores/dataService';
import { clearToken } from '@/utils/auth';
import GitHubIcon from '../icons/github.vue';
import DiscordIcon from '../icons/discord.vue';
import CoffeeIcon from '../icons/coffee.vue';
import AdvertModal from '../modals/AdvertModal.vue';
import NavItem from './NavItem.vue';
import NoiseFloorSparkline from './NoiseFloorSparkline.vue';
import { navigationItems, knownCapabilities } from '@/config/navigation';
import type { NavItemConfig } from '@/config/navigation';
import { useTheme } from '@/composables/useTheme';
import { useSidebarPin } from '@/composables/useSidebarPin';
import { Pin, Search, X } from '@lucide/vue';
import openHopLogo from '@/assets/logo/openhop_transparent_trim.png';

defineOptions({ name: 'SidebarNav' });

const props = defineProps<{ mobileOpen?: boolean }>();
const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const router = useRouter();
const systemStore = useSystemStore();
const dataService = useDataService();
const packetStore = usePacketStore();
const { theme } = useTheme();
const logoSrc = computed(() => openHopLogo);
const { isPinned, togglePin } = useSidebarPin();

const pinIconClass = computed(() =>
  isPinned.value ? 'w-3 h-3' : 'w-3 h-3 rotate-45',
);

const pinButtonClass = computed(() =>
  isPinned.value
    ? 'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 text-primary opacity-100'
    : 'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 text-content-muted hover:text-content-primary',
);

const searchButtonClass = computed(() =>
  showNavSearch.value
    ? 'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 text-primary'
    : 'w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 text-content-muted hover:text-content-primary',
);

// ── Mobile detection ──────────────────────────────────────────────────────────

const isMobile = ref(false);
let _mq: MediaQueryList | null = null;
const mqHandler = (e: MediaQueryListEvent) => { isMobile.value = e.matches; };
onMounted(() => {
  _mq = window.matchMedia('(max-width: 1023px)');
  isMobile.value = _mq.matches;
  _mq.addEventListener('change', mqHandler);
});
onUnmounted(() => { _mq?.removeEventListener('change', mqHandler); });

// Auto-close mobile drawer on navigation.
watch(() => route.fullPath, () => {
  if (isMobile.value) emit('close');
});

const handleLogout = () => {
  clearToken();
  router.push('/login');
  emit('close');
};

// ── Actions ───────────────────────────────────────────────────────────────────

const sendingAdvert = ref(false);
const changingMode = ref(false);
const showAdvertModal = ref(false);
const advertSuccess = ref(false);
const advertError = ref<string | null>(null);

provide(NAV_ACTION_HANDLERS_KEY, {
  sendAdvert: () => { showAdvertModal.value = true },
});

const handleAdvertModalSend = async () => {
  sendingAdvert.value = true;
  advertError.value = null;
  try {
    await systemStore.sendAdvert();
    advertSuccess.value = true;
    setTimeout(() => closeAdvertModal(), 2000);
  } catch (error) {
    advertError.value = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Failed to send advert:', error);
  } finally {
    sendingAdvert.value = false;
  }
};

const closeAdvertModal = () => {
  showAdvertModal.value = false;
  advertSuccess.value = false;
  advertError.value = null;
  sendingAdvert.value = false;
};

const handleSetMode = async (mode: 'forward' | 'monitor' | 'no_tx') => {
  if (changingMode.value || systemStore.currentMode === mode) return;
  changingMode.value = true;
  try {
    await systemStore.setMode(mode);
  } catch (error) {
    console.error('Failed to set mode:', error);
  } finally {
    changingMode.value = false;
  }
};

// ── Nav config ────────────────────────────────────────────────────────────────

// ── Device capability map ─────────────────────────────────────────────────────
// Add new capabilities here as the device gains optional features.
// Nav items declare `enabledWhen: '<key>'` to opt in to conditional visibility.

const capabilities = computed<Record<typeof knownCapabilities[number], boolean>>(() => {
  const stats = systemStore.stats as {
    gps?: { enabled?: boolean };
    sensors?: { enabled?: boolean };
    config?: { gps?: { enabled?: boolean }; sensors?: { enabled?: boolean } };
  } | null;
  return {
    gps:     stats?.gps?.enabled === true || stats?.config?.gps?.enabled === true,
    sensors: stats?.sensors?.enabled === true || stats?.config?.sensors?.enabled === true,
  };
});

function filterNavItems(items: NavItemConfig[]): NavItemConfig[] {
  return items
    .filter((item) => !item.enabledWhen || capabilities.value[item.enabledWhen] === true)
    .map((item) =>
      item.children ? { ...item, children: filterNavItems(item.children) } : item,
    );
}

const navSearch = ref('');
const showNavSearch = ref(false);
const navSearchInput = ref<HTMLInputElement | null>(null);

function toggleNavSearch() {
  showNavSearch.value = !showNavSearch.value;
  if (!showNavSearch.value) {
    navSearch.value = '';
    return;
  }
  nextTick(() => navSearchInput.value?.focus());
}

function clearNavSearch() {
  navSearch.value = '';
  nextTick(() => navSearchInput.value?.focus());
}

function filterNavItemsBySearch(items: NavItemConfig[], query: string): NavItemConfig[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.reduce<NavItemConfig[]>((acc, item) => {
    const matchesSelf =
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.route?.toLowerCase().includes(q) ?? false);

    if (!item.children?.length) {
      if (matchesSelf) acc.push(item);
      return acc;
    }

    const matchedChildren = filterNavItemsBySearch(item.children, q);
    if (matchesSelf) {
      acc.push(item);
      return acc;
    }
    if (matchedChildren.length > 0) {
      acc.push({ ...item, children: matchedChildren });
    }
    return acc;
  }, []);
}

const capabilityFilteredNavItems = computed(() => filterNavItems(navigationItems));
const visibleNavItems = computed(() => filterNavItemsBySearch(capabilityFilteredNavItems.value, navSearch.value));

// ── Status card ───────────────────────────────────────────────────────────────

const currentTier = computed(() => dataService.advertTier.currentTier);
const advertsAllowed = computed(() => dataService.advertTier.advertsAllowed);
const advertsDropped = computed(() => dataService.advertTier.advertsDropped);
const activePenalties = computed(() => dataService.advertTier.activePenalties);

const adaptiveTierClass = computed(() => {
  switch (currentTier.value) {
    case 'quiet':    return 'bg-primary/20 text-primary border-primary/50';
    case 'normal':   return 'bg-primary/20 text-primary border-primary/50';
    case 'busy':     return 'bg-accent-amber/20 text-accent-amber border-accent-amber/50';
    case 'congested': return 'bg-accent-red/20 text-accent-red border-accent-red/50';
    default:         return 'bg-surface-elevated text-content-muted border-stroke-subtle';
  }
});

const modeOptions = [
  { id: 'forward',  label: 'Repeater', title: 'Repeats packets and Room Server and Companion identities can TX.' },
  { id: 'monitor',  label: 'Monitor',  title: 'Does not repeat packets, can Advert, Room Server and Companion identities can TX.' },
  { id: 'no_tx',    label: 'No TX',    title: 'No packets transmitted.' },
];

const dutyCycleBarStyle = computed(() => {
  const percentage = systemStore.dutyCyclePercentage;
  return {
    width: percentage === 0 ? '2px' : `${Math.max(percentage, 2)}%`,
    backgroundColor: percentage > 90
      ? 'var(--color-accent-red)'
      : percentage > 70
        ? 'var(--color-secondary)'
        : 'var(--color-primary)',
  };
});

// ── Version ───────────────────────────────────────────────────────────────────

const showVersionDetails = ref(false);
const isDevBuild = computed(() =>
  systemStore.version.includes('dev') || systemStore.coreVersion.includes('dev'),
);

const parseVersion = (version: string) => {
  const parts = version.match(/^([\d.]+)(\.dev(\d+))?((\+g)([a-f0-9]+))?$/);
  if (!parts) return { base: version, isDev: false, devNumber: null, commit: null };
  return { base: parts[1], isDev: !!parts[2], devNumber: parts[3] || null, commit: parts[6] || null };
};

const repeaterVersion = computed(() => parseVersion(systemStore.version));
const coreVersion = computed(() => parseVersion(systemStore.coreVersion));

const currentTime = computed(() => {
  const times = [systemStore.lastUpdated, packetStore.lastUpdated].filter(Boolean) as Date[];
  if (times.length === 0) return 'Never';
  return times.reduce((a, b) => (a > b ? a : b)).toLocaleTimeString();
});
</script>

<template>
  <!-- Mobile backdrop -->
  <Teleport to="body">
    <Transition name="backdrop">
      <div
        v-if="isMobile && mobileOpen"
        class="fixed inset-0 z-[249] bg-black/30 backdrop-blur-sm"
        @click="emit('close')"
      />
    </Transition>
  </Teleport>

  <!-- Sidebar — inline on desktop, slide-in overlay on mobile -->
  <aside
    :class="[
      isMobile
        ? ['fixed left-0 top-0 bottom-0 w-72 p-4 z-[250] transition-transform duration-300',
           mobileOpen ? 'translate-x-0' : '-translate-x-full']
        : 'w-[285px] flex-shrink-0 p-[15px] h-full',
    ]"
  >
    <div
      :class="[
        'h-full p-6 overflow-y-auto overscroll-contain scrollbar-hide',
        isMobile
          ? 'bg-white/95 dark:bg-black/20 backdrop-blur-xl border border-stroke dark:border-white/10 rounded-2xl shadow-2xl'
          : 'glass-card',
      ]"
    >
      <!-- Header: logo + optional mobile close button -->
      <div :class="['mb-4', isMobile ? 'flex items-start justify-between' : '']">
        <div>
          <div :class="['flex', isMobile ? 'mb-0' : 'mb-0 justify-center']">
            <img :src="logoSrc" alt="openHop" class="logo-image" :class="isMobile ? 'h-[130px]' : 'h-[154px]'" />
          </div>
          <h2 class="text-content-primary text-center text-lg sm:text-xl font-heading font-bold mb-3">
            Repeater
          </h2>
          <p class="text-content-secondary dark:text-content-muted text-sm">
            {{ systemStore.nodeName }}
            <span
              :class="[
                'inline-block w-2 h-2 rounded-full ml-2',
                systemStore.statusBadge.text === 'Active'
                  ? 'bg-primary'
                  : systemStore.statusBadge.text === 'Monitor Mode'
                    ? 'bg-secondary'
                    : 'bg-accent-red',
              ]"
              :title="systemStore.statusBadge.title"
            />
          </p>
          <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
            &lt;{{ systemStore.pubKey }}&gt;
          </p>

          <!-- Status card -->
          <div class="mt-3 rounded-[10px] border border-stroke-subtle dark:border-white/10 bg-white dark:bg-white/5 overflow-hidden">
            <div class="p-2">
              <div class="flex items-center justify-between">
                <span class="text-content-muted text-[10px] uppercase tracking-wide">Adaptive</span>
                <div :class="['inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold', adaptiveTierClass]">
                  {{ currentTier.toUpperCase() }}
                </div>
              </div>
              <div class="flex items-center gap-3 mt-1.5 text-[10px] text-content-muted">
                <span class="text-primary">OK: {{ advertsAllowed }}</span>
                <span class="text-accent-red">Drop: {{ advertsDropped }}</span>
                <span v-if="activePenalties > 0" class="text-accent-amber">Pen: {{ activePenalties }}</span>
              </div>
              <div v-if="systemStore.dutyCycleEnabled" class="mt-2 pt-2 border-t border-stroke-subtle dark:border-white/10">
                <div class="flex items-center justify-between text-[10px] text-content-muted mb-1">
                  <span>Duty Cycle</span>
                  <span class="text-content-primary">
                    {{ systemStore.dutyCycleUtilization.toFixed(1) }}% / {{ systemStore.dutyCycleMax.toFixed(1) }}%
                  </span>
                </div>
                <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-300" :style="dutyCycleBarStyle" />
                </div>
              </div>
              <NoiseFloorSparkline />
            </div>
            <!-- Mode -->
            <div class="flex border-t border-stroke-subtle dark:border-white/10">
              <button
                v-for="opt in modeOptions"
                :key="opt.id"
                type="button"
                :title="opt.title"
                :disabled="changingMode"
                @click="handleSetMode(opt.id as 'forward' | 'monitor' | 'no_tx')"
                :class="[
                  'flex-1 py-2 text-xs font-medium transition-all duration-200 border-r border-stroke-subtle dark:border-white/10 last:border-r-0',
                  changingMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                  systemStore.currentMode === opt.id
                    ? opt.id === 'forward'
                      ? 'bg-mode-segment-forward text-primary'
                      : opt.id === 'monitor'
                        ? 'bg-accent-amber/20 text-accent-amber'
                        : 'bg-mode-segment-no-tx text-accent-red'
                    : 'text-content-primary hover:bg-white/5 dark:hover:bg-white/5',
                ]"
              >
                {{ changingMode && systemStore.currentMode !== opt.id ? '…' : opt.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Mobile close button -->
        <button
          v-if="isMobile"
          @click="emit('close')"
          class="ml-3 flex-shrink-0 text-content-primary dark:text-content-muted hover:text-content-heading dark:hover:text-white transition-colors"
        >✕</button>
      </div>

      <!-- Nav items -->
      <div class="relative mb-8 space-y-2">
        <div class="absolute top-[6px] right-0 z-10 flex items-center gap-1">
          <button
            @click="toggleNavSearch"
            :title="showNavSearch ? 'Hide menu search' : 'Search menu items'"
            :class="searchButtonClass"
          >
            <Search class="w-3.5 h-3.5" />
          </button>
          <button
            @click="togglePin"
            :title="isPinned ? 'Unpin menu layout' : 'Pin menu layout'"
            :class="pinButtonClass"
          >
            <Pin :class="pinIconClass" />
          </button>
        </div>

        <div v-if="showNavSearch" class="pr-16">
          <div class="relative">
            <input
              ref="navSearchInput"
              v-model="navSearch"
              type="text"
              placeholder="Search menu..."
              class="w-full h-8 rounded-[10px] border border-stroke-subtle dark:border-stroke/30 bg-white/70 dark:bg-white/5 px-3 pr-8 text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              v-if="navSearch"
              type="button"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center text-content-muted hover:text-content-primary transition-colors"
              title="Clear search"
              @click="clearNavSearch"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p
          v-if="showNavSearch && navSearch.trim().length > 0 && visibleNavItems.length === 0"
          class="text-xs text-content-muted px-1"
        >
          No menu items match "{{ navSearch }}"
        </p>

        <NavItem
          v-for="item in visibleNavItems"
          :key="item.id"
          :item="item"
          :depth="0"
          :search-active="showNavSearch && navSearch.trim().length > 0"
        />
      </div>

      <!-- Mobile-only: logout -->
      <button
        v-if="isMobile"
        @click="handleLogout"
        class="w-full glass-card-orange hover:bg-accent-red/10 rounded-[10px] py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium text-content-primary dark:text-white transition-all mb-6"
      >
        <svg class="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 3H15C16.1046 3 17 3.89543 17 5V15C17 16.1046 16.1046 17 15 17H13M8 7L4 10.5M4 10.5L8 14M4 10.5H13" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Logout
      </button>

      <!-- Version badges -->
      <div class="mb-4">
        <div v-if="isDevBuild" class="mb-2 glass-card px-3 py-2 rounded-lg border border-accent-cyan/30 bg-accent-cyan/10">
          <div class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4 text-accent-cyan flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
            <span class="text-accent-cyan text-xs font-semibold">Development Build</span>
          </div>
        </div>

        <div @click="showVersionDetails = !showVersionDetails" class="cursor-pointer transition-all duration-200 hover:scale-[1.02]">
          <div class="flex items-center gap-2">
            <span :class="['glass-card px-2 py-1 text-xs font-medium rounded border transition-colors', repeaterVersion.isDev ? 'text-accent-amber border-accent-amber/30' : 'text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke']">
              R:v{{ repeaterVersion.base }}{{ repeaterVersion.isDev ? '-dev' + repeaterVersion.devNumber : '' }}
            </span>
            <span :class="['glass-card px-2 py-1 text-xs font-medium rounded border transition-colors', coreVersion.isDev ? 'text-accent-amber border-accent-amber/30' : 'text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke']">
              Core:v{{ coreVersion.base }}{{ coreVersion.isDev ? '-dev' + coreVersion.devNumber : '' }}
            </span>
            <svg :class="['w-3 h-3 text-content-muted transition-transform duration-200', showVersionDetails ? 'rotate-180' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <div v-if="showVersionDetails" class="mt-2 glass-card px-3 py-2 rounded-lg border border-stroke-subtle dark:border-stroke/30 space-y-2 text-xs animate-fade-in">
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-content-muted font-medium">Repeater:</span>
                <span class="text-content-primary font-mono">v{{ repeaterVersion.base }}</span>
              </div>
              <div v-if="repeaterVersion.isDev" class="pl-2 space-y-0.5 text-[10px] text-content-secondary dark:text-content-muted">
                <div>Dev Build: {{ repeaterVersion.devNumber }}</div>
                <div v-if="repeaterVersion.commit" class="flex items-center gap-1">
                  <span>Commit:</span>
                  <code class="bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded">{{ repeaterVersion.commit }}</code>
                </div>
              </div>
            </div>
            <div class="border-t border-stroke-subtle dark:border-stroke/20" />
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-content-muted font-medium">Core:</span>
                <span class="text-content-primary font-mono">v{{ coreVersion.base }}</span>
              </div>
              <div v-if="coreVersion.isDev" class="pl-2 space-y-0.5 text-[10px] text-content-secondary dark:text-content-muted">
                <div>Dev Build: {{ coreVersion.devNumber }}</div>
                <div v-if="coreVersion.commit" class="flex items-center gap-1">
                  <span>Commit:</span>
                  <code class="bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded">{{ coreVersion.commit }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-stroke-subtle dark:border-stroke mb-4" />

      <div class="flex items-center gap-2 text-content-secondary dark:text-content-muted text-xs mb-3">
        <svg class="w-3 h-3" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.5 13C5.59722 13 4.75174 12.8286 3.96355 12.4858C3.17537 12.143 2.48926 11.6795 1.90522 11.0955C1.32119 10.5115 0.85776 9.82535 0.514945 9.03717C0.172131 8.24898 0.000482491 7.40326 1.0101e-06 6.5C-0.000480471 5.59674 0.171168 4.75126 0.514945 3.96356C0.858723 3.17585 1.32191 2.48974 1.9045 1.90522C2.48709 1.3207 3.1732 0.857278 3.96283 0.514944C4.75246 0.172611 5.59818 0.000962963 6.5 0C7.48703 0 8.42303 0.210648 9.30799 0.631944C10.193 1.05324 10.9421 1.64907 11.5555 2.41944V1.44444C11.5555 1.23981 11.6249 1.06841 11.7635 0.930222C11.9022 0.792037 12.0736 0.722704 12.2778 0.722222C12.4819 0.721741 12.6536 0.791074 12.7927 0.930222C12.9319 1.06937 13.001 1.24078 13 1.44444V4.33333C13 4.53796 12.9307 4.70961 12.792 4.84828C12.6533 4.98694 12.4819 5.05604 12.2778 5.05556H9.38888C9.18425 5.05556 9.01285 4.98622 8.87466 4.84756C8.73647 4.70889 8.66714 4.53748 8.66666 4.33333C8.66618 4.12919 8.73551 3.95778 8.87466 3.81911C9.01381 3.68044 9.18521 3.61111 9.38888 3.61111H10.6528C10.1593 2.93704 9.55138 2.40741 8.82916 2.02222C8.10694 1.63704 7.33055 1.44444 6.5 1.44444C5.09166 1.44444 3.89711 1.93507 2.91633 2.91633C1.93555 3.89759 1.44493 5.09215 1.44444 6.5C1.44396 7.90785 1.93459 9.10265 2.91633 10.0844C3.89807 11.0661 5.09263 11.5565 6.5 11.5556C7.64351 11.5556 8.66666 11.2125 9.56944 10.5264C10.4722 9.84028 11.068 8.95555 11.3569 7.87222C11.4171 7.67963 11.5255 7.53519 11.6819 7.43889C11.8384 7.34259 12.013 7.30648 12.2055 7.33055C12.4102 7.35463 12.5727 7.44178 12.693 7.592C12.8134 7.74222 12.8495 7.90785 12.8014 8.08889C12.4523 9.5213 11.694 10.698 10.5264 11.6191C9.35879 12.5402 8.01666 13.0005 6.5 13ZM7.22222 6.21111L9.02777 8.01667C9.16018 8.14907 9.22638 8.31759 9.22638 8.52222C9.22638 8.72685 9.16018 8.89537 9.02777 9.02778C8.89536 9.16018 8.72685 9.22639 8.52222 9.22639C8.31759 9.22639 8.14907 9.16018 8.01666 9.02778L5.99444 7.00556C5.92222 6.93333 5.86805 6.8522 5.83194 6.76217C5.79583 6.67213 5.77777 6.57872 5.77777 6.48194V3.61111C5.77777 3.40648 5.84711 3.23507 5.98577 3.09689C6.12444 2.9587 6.29585 2.88937 6.5 2.88889C6.70414 2.88841 6.87579 2.95774 7.01494 3.09689C7.15409 3.23604 7.22318 3.40744 7.22222 3.61111V6.21111Z" fill="currentColor" />
        </svg>
        Last Updated: {{ currentTime }}
      </div>

      <div class="flex flex-col items-center justify-center mb-4">
        <p class="text-content-muted text-[10px] mb-1 tracking-wide uppercase opacity-70">Powered by</p>
        <a href="https://meshcore.io" target="_blank" rel="noopener noreferrer" title="MeshCore">
          <img src="@/assets/meshcore.svg" alt="MeshCore" class="h-4 opacity-70 dark:invert-0 invert" />
        </a>
      </div>

      <div class="flex items-center justify-center gap-3">
        <a href="https://discord.gg/qreAsnmJ" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm" title="Discord">
          <DiscordIcon class="w-5 h-5 text-white group-hover:text-indigo-500 transition-colors" />
        </a>
        <a href="https://openhop.dev" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm" title="openHop Website">
          <svg class="w-5 h-5 text-white group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 21a9.004 9.004 0 008.716-6M12 21a9.004 9.004 0 01-8.716-6M12 21c1.656 0 3-4.03 3-9s-1.344-9-3-9m0 18c-1.656 0-3-4.03-3-9s1.344-9 3-9m0 0a9.004 9.004 0 018.716 6M12 3a9.004 9.004 0 00-8.716 6M3.284 9h17.432M3.284 15h17.432" />
          </svg>
        </a>
        <a href="https://github.com/openhop-dev/openhope-repeater" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm" title="GitHub">
          <GitHubIcon class="w-5 h-5 text-white group-hover:text-primary transition-colors" />
        </a>
        <a href="https://buymeacoffee.com/rightup" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-secondary/10 hover:border-secondary/50 dark:hover:border-secondary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm" title="Buy Me a Coffee">
          <CoffeeIcon class="w-5 h-5 text-white group-hover:text-secondary transition-colors" />
        </a>
      </div>
    </div>
  </aside>

  <AdvertModal
    :isOpen="showAdvertModal"
    :isLoading="sendingAdvert"
    :isSuccess="advertSuccess"
    :error="advertError"
    @close="closeAdvertModal"
    @send="handleAdvertModalSend"
  />
</template>

<style scoped>
.backdrop-enter-active,
.backdrop-leave-active {
  transition: opacity 300ms ease;
}
.backdrop-enter-from,
.backdrop-leave-to {
  opacity: 0;
}
</style>
