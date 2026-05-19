<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, defineAsyncComponent, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import { useDataService } from '@/stores/dataService';
import { clearToken } from '@/utils/auth';
import AdvertModal from '../modals/AdvertModal.vue';
import DiscordIcon from '../icons/discord.vue';
import GitHubIcon from '../icons/github.vue';
import CoffeeIcon from '../icons/coffee.vue';

// Lazy load heavy components
const RFNoiseFloor = defineAsyncComponent(() => import('../charts/RFNoiseFloor.vue'));

// Track if the chart should be loaded
const shouldLoadChart = ref(false);

// buttons icons
import ConfigurationsIcon from '../icons/configurations.vue';
import DashboardIcon from '../icons/dashboard.vue';
import HelpIcon from '../icons/help.vue';
import LogsIcon from '../icons/logs.vue';
import TerminalIcon from '../icons/terminal.vue';
import StatsIcon from '../icons/stats.vue';
import SystemIcon from '../icons/system.vue';
import NeighborsIcon from '../icons/neighbors.vue';
import GpsIcon from '../icons/gps.vue';

import DutycycleIcon from '../icons/dutycycle.vue';
import { useTheme } from '@/composables/useTheme';
import logoDark from '@/assets/logo/transparent/logo_pyMC_RBGA_640-Dark.png';
import logoLight from '@/assets/logo/transparent/logo_pyMC_RBGA_640-Light.png';

defineOptions({ name: 'MobileSidebar' });

interface Props {
  showMobileSidebar: boolean;
}

interface Emits {
  (e: 'update:showMobileSidebar', value: boolean): void;
  (e: 'close'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const router = useRouter();
const route = useRoute();
const systemStore = useSystemStore();
const dataService = useDataService();
const { theme } = useTheme();
const logoSrc = computed(() => theme.value === 'dark' ? logoDark : logoLight);

// Load chart only after sidebar is visible for smoother opening
watch(
  () => props.showMobileSidebar,
  (isVisible) => {
    if (isVisible && !shouldLoadChart.value) {
      // Delay chart loading to allow sidebar to open smoothly
      setTimeout(() => {
        shouldLoadChart.value = true;
      }, 100);
    } else if (!isVisible) {
      // Reset when sidebar closes
      shouldLoadChart.value = false;
    }
  },
);

// Loading states for buttons
const sendingAdvert = ref(false);
const changingMode = ref(false);
const changingDutyCycle = ref(false);

// Modal states
const showAdvertModal = ref(false);
const advertSuccess = ref(false);
const advertError = ref<string | null>(null);

let timeInterval: number | null = null;

const currentTier = computed(() => dataService.advertTier.currentTier);
const advertsAllowed = computed(() => dataService.advertTier.advertsAllowed);
const advertsDropped = computed(() => dataService.advertTier.advertsDropped);
const activePenalties = computed(() => dataService.advertTier.activePenalties);

onMounted(() => {
  timeInterval = window.setInterval(() => {
    currentTime.value = new Date().toLocaleTimeString();
  }, 1000);
});

onUnmounted(() => {
  if (timeInterval) {
    clearInterval(timeInterval);
  }
});

const adaptiveTierClass = computed(() => {
  switch (currentTier.value) {
    case 'quiet':
      return 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
    case 'normal':
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50';
    case 'busy':
      return 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50';
    case 'congested':
      return 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50';
    default:
      return 'bg-gray-100 dark:bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/50';
  }
});

// Create a mapping of icon names to components
const iconComponents = {
  dashboard: DashboardIcon,
  neighbors: NeighborsIcon,
  statistics: StatsIcon,
  gps: GpsIcon,
  sensors: SystemIcon,
  'system-stats': SystemIcon,
  sessions: SystemIcon, // Reuse SystemIcon for sessions
  configuration: ConfigurationsIcon,
  'room-servers': ConfigurationsIcon, // Reuse ConfigurationsIcon for room servers
  companions: ConfigurationsIcon, // Reuse for companions
  logs: LogsIcon,
  terminal: TerminalIcon,
  help: HelpIcon,
} as const;

type IconKey = keyof typeof iconComponents;

type NavGroup = 'monitoring' | 'system' | 'room' | 'other';

const baseSidebarItems: Array<{ name: string; icon: IconKey; route: string; group: NavGroup }> = [
  { name: 'Dashboard', icon: 'dashboard', route: '/', group: 'monitoring' },
  { name: 'Neighbors', icon: 'neighbors', route: '/neighbors', group: 'monitoring' },
  { name: 'Statistics', icon: 'statistics', route: '/statistics', group: 'monitoring' },
  { name: 'GPS', icon: 'gps', route: '/gps', group: 'monitoring' },
  { name: 'Sensors', icon: 'sensors', route: '/sensors', group: 'monitoring' },
  { name: 'System Stats', icon: 'system-stats', route: '/system-stats', group: 'monitoring' },
  { name: 'Sessions', icon: 'sessions', route: '/sessions', group: 'system' },
  { name: 'Configuration', icon: 'configuration', route: '/configuration', group: 'system' },
  { name: 'Terminal', icon: 'terminal', route: '/terminal', group: 'system' },
  { name: 'Room Servers', icon: 'room-servers', route: '/room-servers', group: 'room' },
  { name: 'Companions', icon: 'companions', route: '/companions', group: 'room' },
  { name: 'Logs', icon: 'logs', route: '/logs', group: 'other' },
  { name: 'Help', icon: 'help', route: '/help', group: 'other' },
];

const isGpsEnabled = computed(() => {
  const stats = systemStore.stats as { gps?: { enabled?: boolean }; config?: { gps?: { enabled?: boolean } } } | null;
  return stats?.gps?.enabled === true || stats?.config?.gps?.enabled === true;
});

const isSensorsEnabled = computed(() => {
  const stats = systemStore.stats as {
    sensors?: { enabled?: boolean };
    config?: { sensors?: { enabled?: boolean } };
  } | null;
  return stats?.sensors?.enabled === true || stats?.config?.sensors?.enabled === true;
});

const sidebarItems = computed(() =>
  baseSidebarItems.filter(
    (item) =>
      (item.route !== '/gps' || isGpsEnabled.value) &&
      (item.route !== '/sensors' || isSensorsEnabled.value),
  ),
);

const navMonitoring = computed(() => sidebarItems.value.filter((i) => i.group === 'monitoring'));
const navSystem = computed(() => sidebarItems.value.filter((i) => i.group === 'system'));
const navRoom = computed(() => sidebarItems.value.filter((i) => i.group === 'room'));
const navOther = computed(() => sidebarItems.value.filter((i) => i.group === 'other'));

const modeOptions = [
  {
    id: 'forward',
    label: 'Forward',
    title: 'Repeats packets and Room Server and Companion identities can TX.',
  },
  {
    id: 'monitor',
    label: 'Monitor',
    title: 'Does not repeat packets, can Advert, Room Server and Companion identities can TX.',
  },
  { id: 'no_tx', label: 'No TX', title: 'No packets transmitted.' },
];

// Check if a route is active
const isRouteActive = computed(() => (itemRoute: string) => {
  return route.path === itemRoute;
});

// Navigate to route
const navigateToRoute = (routePath: string) => {
  router.push(routePath);
  closeSidebar();
};

const closeSidebar = () => {
  emit('update:showMobileSidebar', false);
};

const handleLogout = () => {
  clearToken();
  router.push('/login');
  closeSidebar();
};

// Button actions
const handleAdvertModalSend = async () => {
  sendingAdvert.value = true;
  advertError.value = null;

  try {
    await systemStore.sendAdvert();
    advertSuccess.value = true;

    // Auto-close after 2 seconds
    setTimeout(() => {
      closeAdvertModal();
    }, 2000);
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
  if (changingMode.value) return;
  if (systemStore.currentMode === mode) return;

  changingMode.value = true;
  try {
    await systemStore.setMode(mode);
  } catch (error) {
    console.error('Failed to set mode:', error);
  } finally {
    changingMode.value = false;
  }
};

const handleToggleDutyCycle = async () => {
  if (changingDutyCycle.value) return;

  changingDutyCycle.value = true;
  try {
    await systemStore.toggleDutyCycle();
  } catch (error) {
    console.error('Failed to toggle duty cycle:', error);
  } finally {
    changingDutyCycle.value = false;
  }
};

// Computed values
const currentTime = ref(new Date().toLocaleTimeString());

// Version info expansion
const showVersionDetails = ref(false);

// Check if versions are dev builds
const isDevBuild = computed(() => {
  return systemStore.version.includes('dev') || systemStore.coreVersion.includes('dev');
});

// Parse version info for display
const parseVersion = (version: string) => {
  const parts = version.match(/^([\d.]+)(\.dev(\d+))?((\+g)([a-f0-9]+))?$/);
  if (!parts) return { base: version, isDev: false, devNumber: null, commit: null };

  return {
    base: parts[1],
    isDev: !!parts[2],
    devNumber: parts[3] || null,
    commit: parts[6] || null,
  };
};

const repeaterVersion = computed(() => parseVersion(systemStore.version));
const coreVersion = computed(() => parseVersion(systemStore.coreVersion));

// Computed duty cycle bar width and color
// Width is genuinely dynamic; colour uses CSS custom properties so it adapts to light/dark mode.
const dutyCycleBarStyle = computed(() => {
  const percentage = systemStore.dutyCyclePercentage;
  let backgroundColor = 'var(--color-accent-green)';

  if (percentage > 90) {
    backgroundColor = 'var(--color-accent-red)';
  } else if (percentage > 70) {
    backgroundColor = 'var(--color-secondary)';
  }

  return {
    width: percentage === 0 ? '.125rem' : `${Math.max(percentage, 2)}%`,
    backgroundColor,
  };
});
</script>

<template>
  <div
    class="fixed inset-0 z-[250] lg:hidden"
    :class="showMobileSidebar ? 'pointer-events-auto' : 'pointer-events-none'"
  >
    <div
      class="absolute inset-0 bg-black/30 backdrop-blur-sm dark:bg-black/30 transition-opacity duration-300 cursor-pointer"
      :class="showMobileSidebar ? 'opacity-100' : 'opacity-0'"
      @click="closeSidebar"
    ></div>
    <div
      class="absolute left-0 top-0 bottom-0 w-72 p-4 transition-transform duration-300"
      :class="showMobileSidebar ? 'translate-x-0' : '-translate-x-full'"
    >
      <div
        class="bg-white/95 dark:bg-black/20 backdrop-blur-xl border border-stroke dark:border-white/10 rounded-2xl h-full p-6 overflow-auto shadow-2xl"
      >
        <div class="mb-6 flex items-center justify-between">
          <div>
            <div class="mb-2">
<img :src="logoSrc" alt="pyMC" class="h-[5.2rem]" />
            </div>
            <p class="text-content-secondary dark:text-[#C3C3C3] text-sm">
              {{ systemStore.nodeName }}
              <span
                :class="[
                  'inline-block w-2 h-2 rounded-full ml-2',
                  systemStore.statusBadge.text === 'Active'
                    ? 'bg-accent-green'
                    : systemStore.statusBadge.text === 'Monitor Mode'
                      ? 'bg-secondary'
                      : 'bg-accent-red',
                ]"
                :title="systemStore.statusBadge.title"
              ></span>
            </p>
            <p class="text-content-secondary dark:text-[#C3C3C3] text-sm mt-1">
              &lt;{{ systemStore.pubKey }}&gt;
            </p>

            <div
              class="mt-3 p-2 rounded-[10px] border border-stroke-subtle dark:border-white/10 bg-white dark:bg-white/5"
            >
              <div class="flex items-center justify-between">
                <span class="text-content-muted text-[10px] uppercase tracking-wide">Adaptive</span>
                <div
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                    adaptiveTierClass,
                  ]"
                >
                  {{ currentTier.toUpperCase() }}
                </div>
              </div>
              <div class="flex items-center gap-3 mt-1.5 text-[10px] text-content-muted">
                <span class="text-green-600 dark:text-green-400">OK: {{ advertsAllowed }}</span>
                <span class="text-red-600 dark:text-red-400">Drop: {{ advertsDropped }}</span>
                <span v-if="activePenalties > 0" class="text-orange-600 dark:text-orange-400"
                  >Pen: {{ activePenalties }}</span
                >
              </div>
            </div>
          </div>
          <button
            @click="closeSidebar"
            class="text-content-primary dark:text-content-muted hover:text-content-heading dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        <div class="border-t border-stroke dark:border-dark-border mb-4"></div>

        <div class="mb-4">
          <p class="text-content-muted text-xs uppercase mb-2">Actions</p>
          <button
            @click="
              showAdvertModal = true;
              closeSidebar();
            "
            class="w-full bg-white dark:bg-white/10 rounded-[.625rem] py-3 px-4 flex items-center gap-2 text-sm font-medium text-[#212122] dark:text-white border border-stroke-subtle dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/20 transition-colors mb-2"
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 0C5.61553 0 4.26216 0.410543 3.11101 1.17971C1.95987 1.94888 1.06266 3.04213 0.532846 4.32122C0.003033 5.6003 -0.13559 7.00777 0.134506 8.36563C0.404603 9.7235 1.07129 10.9708 2.05026 11.9497C3.02922 12.9287 4.2765 13.5954 5.63437 13.8655C6.99224 14.1356 8.3997 13.997 9.67879 13.4672C10.9579 12.9373 12.0511 12.0401 12.8203 10.889C13.5895 9.73785 14 8.38447 14 7C13.998 5.1441 13.2599 3.36479 11.9475 2.05247C10.6352 0.74015 8.8559 0.0020073 7 0V0ZM7 12.8333C5.84628 12.8333 4.71846 12.4912 3.75918 11.8502C2.79989 11.2093 2.05222 10.2982 1.61071 9.23232C1.16919 8.16642 1.05368 6.99353 1.27876 5.86197C1.50384 4.73042 2.05941 3.69102 2.87521 2.87521C3.69102 2.0594 4.73042 1.50383 5.86198 1.27875C6.99353 1.05367 8.16642 1.16919 9.23232 1.6107C10.2982 2.05221 11.2093 2.79989 11.8502 3.75917C12.4912 4.71846 12.8333 5.84628 12.8333 7C12.8316 8.54658 12.2165 10.0293 11.1229 11.1229C10.0293 12.2165 8.54658 12.8316 7 12.8333ZM8.16667 7C8.1676 7.20501 8.11448 7.40665 8.01268 7.58461C7.91087 7.76256 7.76397 7.91054 7.58677 8.01365C7.40957 8.11676 7.20833 8.17136 7.00332 8.17194C6.7983 8.17252 6.59675 8.11906 6.41897 8.01696C6.24119 7.91485 6.09346 7.7677 5.99065 7.59033C5.88784 7.41295 5.83358 7.21162 5.83335 7.0066C5.83312 6.80159 5.88691 6.60013 5.98932 6.42252C6.09172 6.24491 6.23912 6.09743 6.41667 5.99492V3.5H7.58334V5.99492C7.76016 6.09659 7.90713 6.24298 8.00952 6.41939C8.1119 6.5958 8.1661 6.79603 8.16667 7Z"
                fill="currentColor"
              />
            </svg>
            Send Advert
          </button>
        </div>

        <div class="mb-4">
          <p class="text-content-muted text-xs uppercase mb-2">Monitoring</p>
          <div class="space-y-2 mb-3">
            <button
              v-for="item in navMonitoring"
              :key="item.name"
              @click="navigateToRoute(item.route)"
              :class="
                isRouteActive(item.route)
                  ? 'bg-primary/20 shadow-[0_0_.375rem_0_rgba(170,232,232,0.20)] text-primary'
                  : 'text-content-primary dark:text-white hover:bg-content-primary/10 dark:hover:bg-white/5'
              "
              class="w-full rounded-[.625rem] py-3 px-4 flex items-center gap-3 text-sm transition-all"
            >
              <component :is="iconComponents[item.icon]" class="w-3.5 h-3.5" />
              {{ item.name }}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <p class="text-content-muted text-xs uppercase mb-2">System</p>
          <div class="space-y-2 mb-3">
            <button
              v-for="item in navSystem"
              :key="item.name"
              @click="navigateToRoute(item.route)"
              :class="
                isRouteActive(item.route)
                  ? 'bg-primary/20 shadow-[0_0_.375rem_0_rgba(170,232,232,0.20)] text-primary'
                  : 'text-content-primary dark:text-white hover:bg-content-primary/10 dark:hover:bg-white/5'
              "
              class="w-full rounded-[.625rem] py-3 px-4 flex items-center gap-3 text-sm transition-all"
            >
              <component :is="iconComponents[item.icon]" class="w-3.5 h-3.5" />
              {{ item.name }}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <p class="text-content-muted text-xs uppercase mb-2">Room Servers &amp; Companions</p>
          <div class="space-y-2 mb-3">
            <button
              v-for="item in navRoom"
              :key="item.name"
              @click="navigateToRoute(item.route)"
              :class="
                isRouteActive(item.route)
                  ? 'bg-primary/20 shadow-[0_0_.375rem_0_rgba(170,232,232,0.20)] text-primary'
                  : 'text-content-primary dark:text-white hover:bg-content-primary/10 dark:hover:bg-white/5'
              "
              class="w-full rounded-[.625rem] py-3 px-4 flex items-center gap-3 text-sm transition-all"
            >
              <component :is="iconComponents[item.icon]" class="w-3.5 h-3.5" />
              {{ item.name }}
            </button>
          </div>
        </div>

        <div class="mb-4">
          <p class="text-content-muted text-xs uppercase mb-2">Other</p>
          <div class="space-y-2 mb-3">
            <button
              v-for="item in navOther"
              :key="item.name"
              @click="navigateToRoute(item.route)"
              :class="
                isRouteActive(item.route)
                  ? 'bg-primary/20 shadow-[0_0_.375rem_0_rgba(170,232,232,0.20)] text-primary'
                  : 'text-content-primary dark:text-white hover:bg-content-primary/10 dark:hover:bg-white/5'
              "
              class="w-full rounded-[.625rem] py-3 px-4 flex items-center gap-3 text-sm transition-all"
            >
              <component :is="iconComponents[item.icon]" class="w-3.5 h-3.5" />
              {{ item.name }}
            </button>
          </div>
        </div>

        <!-- Lazy load the chart after sidebar opens for instant UI -->
        <RFNoiseFloor
          v-if="shouldLoadChart"
          :current-value="systemStore.noiseFloorDbm || -116.0"
          :update-interval="3000"
          :limit="50"
          class="mb-4"
        />

        <div class="mb-3">
          <p class="text-content-muted text-xs uppercase mb-2">Mode</p>
          <div
            class="flex rounded-[.625rem] overflow-hidden border border-stroke dark:border-white/10 bg-white dark:bg-white/5"
          >
            <button
              v-for="opt in modeOptions"
              :key="opt.id"
              type="button"
              :title="opt.title"
              :disabled="changingMode"
              @click="handleSetMode(opt.id as 'forward' | 'monitor' | 'no_tx')"
              :class="[
                'flex-1 py-2.5 px-2 text-xs font-medium transition-all duration-200 border-r border-stroke dark:border-white/10 last:border-r-0',
                changingMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                systemStore.currentMode === opt.id
                  ? opt.id === 'forward'
                    ? 'bg-mode-segment-forward text-accent-green'
                    : opt.id === 'monitor'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-mode-segment-no-tx text-accent-red'
                  : 'text-content-primary dark:text-white hover:bg-white/10 dark:hover:bg-white/10',
              ]"
            >
              {{ changingMode && systemStore.currentMode !== opt.id ? '…' : opt.label }}
            </button>
          </div>
        </div>

        <button
          @click="handleToggleDutyCycle"
          :disabled="changingDutyCycle"
          :class="[
            'p-4 flex items-center justify-between mb-3 w-full transition-all duration-200 cursor-pointer group',
            systemStore.dutyCycleButtonState.warning
              ? 'glass-card-orange hover:bg-accent-red/10'
              : 'glass-card-green hover:bg-accent-green/10',
          ]"
        >
          <div class="flex items-center gap-3">
            <DutycycleIcon
              class="w-3.5 h-3.5 text-content-primary dark:text-white group-hover:text-primary transition-colors"
            />
            <span
              class="text-content-primary dark:text-white text-sm group-hover:text-primary transition-colors"
              >Duty Cycle</span
            >
          </div>
          <span
            :class="[
              'text-xs font-medium group-hover:text-primary dark:group-hover:text-white transition-colors',
              systemStore.dutyCycleButtonState.warning ? 'text-accent-red' : 'text-primary',
            ]"
          >
            {{
              changingDutyCycle
                ? 'Changing...'
                : systemStore.dutyCycleEnabled
                  ? 'Enabled'
                  : 'Disabled'
            }}
          </span>
        </button>

        <!-- Logout button -->
        <button
          @click="handleLogout"
          class="w-full glass-card-orange hover:bg-accent-red/10 rounded-[.625rem] py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium text-content-primary dark:text-white transition-all mb-4"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M13 3H15C16.1046 3 17 3.89543 17 5V15C17 16.1046 16.1046 17 15 17H13M8 7L4 10.5M4 10.5L8 14M4 10.5H13"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Logout
        </button>

        <!-- Version badges with site styling -->
        <div class="mb-4">
          <div
            @click="showVersionDetails = !showVersionDetails"
            class="flex items-center gap-2 cursor-pointer group"
          >
            <span
              :class="[
                'glass-card px-2 py-1 text-xs font-medium rounded border transition-all duration-200',
                'border-stroke dark:border-dark-border',
                repeaterVersion.isDev
                  ? 'text-secondary bg-secondary-bg/20 dark:bg-secondary-bg/10 border-secondary/40'
                  : 'text-content-muted',
              ]"
            >
              R:v{{ repeaterVersion.base
              }}{{ repeaterVersion.isDev ? `.dev${repeaterVersion.devNumber}` : '' }}
            </span>
            <span
              :class="[
                'glass-card px-2 py-1 text-xs font-medium rounded border transition-all duration-200',
                'border-stroke dark:border-dark-border',
                coreVersion.isDev
                  ? 'text-secondary bg-secondary-bg/20 dark:bg-secondary-bg/10 border-secondary/40'
                  : 'text-content-muted',
              ]"
            >
              C:v{{ coreVersion.base }}{{ coreVersion.isDev ? `.dev${coreVersion.devNumber}` : '' }}
            </span>
            <svg
              v-if="isDevBuild"
              :class="[
                'w-3 h-3 text-content-muted transition-transform duration-200',
                showVersionDetails ? 'rotate-180' : '',
              ]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          <!-- Expanded version details -->
          <div
            v-if="showVersionDetails"
            class="mt-2 glass-card px-3 py-2 rounded-lg border border-stroke-subtle dark:border-stroke/30 space-y-2 text-xs animate-fade-in"
          >
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-content-muted font-medium">Repeater:</span>
                <span class="text-content-primary dark:text-content-primary font-mono"
                  >v{{ repeaterVersion.base }}</span
                >
              </div>
              <div
                v-if="repeaterVersion.isDev"
                class="pl-2 space-y-0.5 text-[10px] text-content-secondary dark:text-content-muted"
              >
                <div>Dev Build: {{ repeaterVersion.devNumber }}</div>
                <div v-if="repeaterVersion.commit" class="flex items-center gap-1">
                  <span>Commit:</span>
                  <code class="bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded">{{
                    repeaterVersion.commit
                  }}</code>
                </div>
              </div>
            </div>

            <div class="border-t border-stroke-subtle dark:border-stroke/20"></div>

            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-content-muted font-medium">Core:</span>
                <span class="text-content-primary dark:text-content-primary font-mono"
                  >v{{ coreVersion.base }}</span
                >
              </div>
              <div
                v-if="coreVersion.isDev"
                class="pl-2 space-y-0.5 text-[10px] text-content-secondary dark:text-content-muted"
              >
                <div>Dev Build: {{ coreVersion.devNumber }}</div>
                <div v-if="coreVersion.commit" class="flex items-center gap-1">
                  <span>Commit:</span>
                  <code class="bg-white/5 dark:bg-black/20 px-1 py-0.5 rounded">{{
                    coreVersion.commit
                  }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-accent-green mb-4"></div>

        <!-- Duty cycle info - only show when enabled -->
        <div v-if="systemStore.dutyCycleEnabled" class="mb-4">
          <p class="text-content-muted text-xs mb-2">
            Duty Cycle:
            <span class="text-content-primary dark:text-white"
              >{{ systemStore.dutyCycleUtilization.toFixed(1) }}% /
              {{ systemStore.dutyCycleMax.toFixed(1) }}%</span
            >
          </p>

          <!-- Duty cycle progress bar -->
          <div class="w-full h-1 bg-stroke-subtle dark:bg-white/10 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :style="dutyCycleBarStyle"
            ></div>
          </div>
        </div>

        <p class="text-content-muted text-xs">Last Updated: {{ currentTime }}</p>

        <div class="flex flex-col items-center justify-center mt-4">
          <p class="text-content-muted text-[10px] mb-1 tracking-wide uppercase opacity-70">
            Powered by
          </p>
          <a href="https://meshcore.io" target="_blank" rel="noopener noreferrer" title="MeshCore">
            <img
              src="@/assets/meshcore.svg"
              alt="MeshCore"
              class="h-4 opacity-70 dark:invert-0 invert"
            />
          </a>
        </div>

        <div class="flex items-center justify-center gap-3 mt-4">
          <a
            href="https://discord.gg/SMHkUDwf"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
            title="Discord"
          >
            <DiscordIcon class="w-5 h-5 text-white group-hover:text-indigo-500 transition-colors" />
          </a>
          <a
            href="https://github.com/rightup"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
            title="GitHub"
          >
            <GitHubIcon class="w-5 h-5 text-white group-hover:text-primary transition-colors" />
          </a>
          <a
            href="https://buymeacoffee.com/rightup"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-yellow-50 dark:hover:bg-yellow-500/20 hover:border-yellow-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
            title="Buy Me a Coffee"
          >
            <CoffeeIcon class="w-5 h-5 text-white group-hover:text-yellow-500 transition-colors" />
          </a>
        </div>
      </div>
    </div>
  </div>

  <!-- Advertisement Modal -->
  <AdvertModal
    :isOpen="showAdvertModal"
    :isLoading="sendingAdvert"
    :isSuccess="advertSuccess"
    :error="advertError"
    @close="closeAdvertModal"
    @send="handleAdvertModalSend"
  />
</template>
