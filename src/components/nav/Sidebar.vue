<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSystemStore } from '@/stores/system';
import { usePacketStore } from '@/stores/packets';
import { useDataService } from '@/stores/dataService';
import GitHubIcon from '../icons/github.vue';
import DiscordIcon from '../icons/discord.vue';
import CoffeeIcon from '../icons/coffee.vue';
import RFNoiseFloor from '../charts/RFNoiseFloor.vue';
import AdvertModal from '../modals/AdvertModal.vue';

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

defineOptions({ name: 'SidebarNav' });

const router = useRouter();
const route = useRoute();
const systemStore = useSystemStore();
const dataService = useDataService();
const { theme } = useTheme();
const logoSrc = computed(() => theme.value === 'dark' ? logoDark : logoLight);
const packetStore = usePacketStore();

// Loading states for buttons
const sendingAdvert = ref(false);
const changingMode = ref(false);
const changingDutyCycle = ref(false);

// Modal states
const showAdvertModal = ref(false);
const advertSuccess = ref(false);
const advertError = ref<string | null>(null);

const currentTier = computed(() => dataService.advertTier.currentTier);
const advertsAllowed = computed(() => dataService.advertTier.advertsAllowed);
const advertsDropped = computed(() => dataService.advertTier.advertsDropped);
const activePenalties = computed(() => dataService.advertTier.activePenalties);

const adaptiveTierClass = computed(() => {
  switch (currentTier.value) {
    case 'quiet':
      return 'bg-accent-green/20 text-accent-green border-accent-green/50';
    case 'normal':
      return 'bg-primary/20 text-primary border-primary/50';
    case 'busy':
      return 'bg-secondary/20 text-secondary border-secondary/50';
    case 'congested':
      return 'bg-accent-red/20 text-accent-red border-accent-red/50';
    default:
      return 'bg-surface-elevated text-content-muted border-stroke-subtle';
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

// Most recent fetch across all stores
const currentTime = computed(() => {
  const times = [systemStore.lastUpdated, packetStore.lastUpdated].filter(Boolean) as Date[];
  if (times.length === 0) return 'Never';
  const latest = times.reduce((a, b) => (a > b ? a : b));
  return latest.toLocaleTimeString();
});

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
    width: percentage === 0 ? '2px' : `${Math.max(percentage, 2)}%`,
    backgroundColor,
  };
});

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
</script>

<template>
  <aside class="w-[285px] flex-shrink-0 p-[15px] hidden lg:block">
    <div class="glass-card h-full p-6">
      <div class="mb-12">
        <div class="mb-3 flex justify-center">
          <img
            :src="logoSrc"
            alt="pyMC"
            class="h-[6.5rem]"
          />
        </div>
        <p class="text-content-secondary dark:text-content-muted text-sm">
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
        <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
          &lt;{{ systemStore.pubKey }}&gt;
        </p>

        <div
          class="mt-3 p-2 rounded-[10px] border border-stroke-subtle dark:border-white/10 bg-white dark:bg-white/5"
        >
          <div class="flex items-center justify-between">
            <span
              class="text-content-muted dark:text-content-muted text-[10px] uppercase tracking-wide"
              >Adaptive</span
            >
            <div
              :class="[
                'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                adaptiveTierClass,
              ]"
            >
              {{ currentTier.toUpperCase() }}
            </div>
          </div>
          <div
            class="flex items-center gap-3 mt-1.5 text-[10px] text-content-muted dark:text-content-muted"
          >
            <span class="text-green-600 dark:text-green-400">OK: {{ advertsAllowed }}</span>
            <span class="text-red-600 dark:text-red-400">Drop: {{ advertsDropped }}</span>
            <span v-if="activePenalties > 0" class="text-orange-600 dark:text-orange-400"
              >Pen: {{ activePenalties }}</span
            >
          </div>
        </div>
      </div>

      <div class="border-t border-stroke-subtle dark:border-stroke mb-6"></div>

      <div class="mb-8">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-4">Actions</p>
        <button
          @click="showAdvertModal = true"
          class="w-full bg-white dark:bg-white/10 rounded-[10px] py-3 px-4 flex items-center gap-2 text-sm font-medium text-[#212122] dark:text-white border border-stroke-subtle dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/20 transition-colors"
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

      <div class="mb-8">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-4">Monitoring</p>
        <TransitionGroup tag="div" class="space-y-2" name="sidebar-item">
          <button
            v-for="item in navMonitoring"
            :key="item.name"
            @click="navigateToRoute(item.route)"
            :class="
              isRouteActive(item.route)
                ? 'bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 dark:bg-primary/30 border-cyan-500 dark:border-primary/40 shadow-[0_4px_16px_rgba(6,182,212,0.4)] dark:shadow-[0_4px_12px_rgba(170,232,232,0.25)] text-white dark:text-primary font-semibold'
                : 'text-content-primary dark:text-content-primary hover:bg-gradient-to-r hover:from-cyan-400/20 hover:to-cyan-500/20 dark:hover:bg-primary/5 hover:border-cyan-400/30 dark:hover:border-primary/20 hover:shadow-[0_2px_12px_rgba(6,182,212,0.2)] dark:hover:shadow-[0_2px_8px_rgba(170,232,232,0.15)] border border-stroke-subtle dark:border-transparent'
            "
            class="w-full rounded-[10px] py-3 px-4 flex items-center gap-3 text-sm font-medium transition-all duration-200"
          >
            <component
              :is="iconComponents[item.icon]"
              :class="
                isRouteActive(item.route)
                  ? 'w-3.5 h-3.5 text-white dark:text-primary [&_path]:fill-current'
                  : 'w-3.5 h-3.5 text-content-primary dark:text-content-primary [&_path]:fill-current'
              "
            />
            {{ item.name }}
          </button>
        </TransitionGroup>
      </div>

      <div class="mb-8">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-4">System</p>
        <div class="space-y-2">
          <button
            v-for="item in navSystem"
            :key="item.name"
            @click="navigateToRoute(item.route)"
            :class="
              isRouteActive(item.route)
                ? 'bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 dark:bg-primary/30 border-cyan-500 dark:border-primary/40 shadow-[0_4px_16px_rgba(6,182,212,0.4)] dark:shadow-[0_4px_12px_rgba(170,232,232,0.25)] text-white dark:text-primary font-semibold'
                : 'text-content-primary dark:text-content-primary hover:bg-gradient-to-r hover:from-cyan-400/20 hover:to-cyan-500/20 dark:hover:bg-primary/5 hover:border-cyan-400/30 dark:hover:border-primary/20 hover:shadow-[0_2px_12px_rgba(6,182,212,0.2)] dark:hover:shadow-[0_2px_8px_rgba(170,232,232,0.15)] border border-stroke-subtle dark:border-transparent'
            "
            class="w-full rounded-[10px] py-3 px-4 flex items-center gap-3 text-sm font-medium transition-all duration-200"
          >
            <component
              :is="iconComponents[item.icon]"
              :class="
                isRouteActive(item.route)
                  ? 'w-3.5 h-3.5 text-white dark:text-primary [&_path]:fill-current'
                  : 'w-3.5 h-3.5 text-content-primary dark:text-content-primary [&_path]:fill-current'
              "
            />
            {{ item.name }}
          </button>
        </div>
      </div>

      <div class="mb-8">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-4">
          Room Servers &amp; Companions
        </p>
        <div class="space-y-2">
          <button
            v-for="item in navRoom"
            :key="item.name"
            @click="navigateToRoute(item.route)"
            :class="
              isRouteActive(item.route)
                ? 'bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 dark:bg-primary/30 border-cyan-500 dark:border-primary/40 shadow-[0_4px_16px_rgba(6,182,212,0.4)] dark:shadow-[0_4px_12px_rgba(170,232,232,0.25)] text-white dark:text-primary font-semibold'
                : 'text-content-primary dark:text-content-primary hover:bg-gradient-to-r hover:from-cyan-400/20 hover:to-cyan-500/20 dark:hover:bg-primary/5 hover:border-cyan-400/30 dark:hover:border-primary/20 hover:shadow-[0_2px_12px_rgba(6,182,212,0.2)] dark:hover:shadow-[0_2px_8px_rgba(170,232,212,0.15)] border border-stroke-subtle dark:border-transparent'
            "
            class="w-full rounded-[10px] py-3 px-4 flex items-center gap-3 text-sm font-medium transition-all duration-200"
          >
            <component
              :is="iconComponents[item.icon]"
              :class="
                isRouteActive(item.route)
                  ? 'w-3.5 h-3.5 text-white dark:text-primary [&_path]:fill-current'
                  : 'w-3.5 h-3.5 text-content-primary dark:text-content-primary [&_path]:fill-current'
              "
            />
            {{ item.name }}
          </button>
        </div>
      </div>

      <div class="mb-8">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-4">Other</p>
        <div class="space-y-2">
          <button
            v-for="item in navOther"
            :key="item.name"
            @click="navigateToRoute(item.route)"
            :class="
              isRouteActive(item.route)
                ? 'bg-gradient-to-r from-cyan-400/90 to-cyan-500/90 dark:bg-primary/30 border-cyan-500 dark:border-primary/40 shadow-[0_4px_16px_rgba(6,182,212,0.4)] dark:shadow-[0_4px_12px_rgba(170,232,232,0.25)] text-white dark:text-primary font-semibold'
                : 'text-content-primary dark:text-content-primary hover:bg-gradient-to-r hover:from-cyan-400/20 hover:to-cyan-500/20 dark:hover:bg-primary/5 hover:border-cyan-400/30 dark:hover:border-primary/20 hover:shadow-[0_2px_12px_rgba(6,182,212,0.2)] dark:hover:shadow-[0_2px_8px_rgba(170,232,232,0.15)] border border-stroke-subtle dark:border-transparent'
            "
            class="w-full rounded-[10px] py-3 px-4 flex items-center gap-3 text-sm font-medium transition-all duration-200"
          >
            <component
              :is="iconComponents[item.icon]"
              :class="
                isRouteActive(item.route)
                  ? 'w-3.5 h-3.5 text-white dark:text-primary [&_path]:fill-current'
                  : 'w-3.5 h-3.5 text-content-primary dark:text-content-primary [&_path]:fill-current'
              "
            />
            {{ item.name }}
          </button>
        </div>
      </div>

      <RFNoiseFloor
        :current-value="systemStore.noiseFloorDbm || -116.0"
        :update-interval="3000"
        class="mb-6"
      />

      <div class="mb-4">
        <p class="text-content-muted dark:text-content-muted text-xs uppercase mb-2">Mode</p>
        <div
          class="flex rounded-[10px] overflow-hidden border border-stroke-subtle dark:border-white/10 bg-white dark:bg-white/5"
        >
          <button
            v-for="opt in modeOptions"
            :key="opt.id"
            type="button"
            :title="opt.title"
            :disabled="changingMode"
            @click="handleSetMode(opt.id as 'forward' | 'monitor' | 'no_tx')"
            :class="[
              'flex-1 py-2.5 px-2 text-xs font-medium transition-all duration-200 border-r border-stroke-subtle dark:border-white/10 last:border-r-0',
              changingMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              systemStore.currentMode === opt.id
                ? opt.id === 'forward'
                  ? 'bg-mode-segment-forward text-accent-green'
                  : opt.id === 'monitor'
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    : 'bg-mode-segment-no-tx text-accent-red'
                : 'text-content-primary dark:text-content-primary hover:bg-white/10 dark:hover:bg-white/10',
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
          'p-4 flex items-center justify-between mb-4 w-full transition-all duration-200 cursor-pointer group',
          systemStore.dutyCycleButtonState.warning
            ? 'glass-card-orange hover:bg-accent-red/10'
            : 'glass-card-green hover:bg-accent-green/10',
        ]"
      >
        <div class="flex items-center gap-3">
          <DutycycleIcon
            class="w-3.5 h-3.5 text-content-primary dark:text-content-primary group-hover:text-primary transition-colors"
          />
          <span
            class="text-content-primary dark:text-content-primary text-sm group-hover:text-primary transition-colors"
            >Duty Cycle</span
          >
        </div>
        <span
          :class="[
            'text-xs font-medium group-hover:text-white transition-colors',
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

      <!-- Version badges with site styling -->
      <div class="mb-4">
        <!-- Dev warning badge -->
        <div
          v-if="isDevBuild"
          class="mb-2 glass-card px-3 py-2 rounded-lg border border-blue-500/30 dark:border-blue-400/50 bg-blue-500/10 dark:bg-blue-400/20"
        >
          <div class="flex items-center justify-center gap-2">
            <svg
              class="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
            <span class="text-blue-500 dark:text-blue-400 text-xs font-semibold"
              >Development Build</span
            >
          </div>
        </div>

        <!-- Version display -->
        <div
          @click="showVersionDetails = !showVersionDetails"
          class="cursor-pointer transition-all duration-200 hover:scale-[1.02]"
        >
          <div class="flex items-center gap-2">
            <span
              :class="[
                'glass-card px-2 py-1 text-xs font-medium rounded border transition-colors',
                repeaterVersion.isDev
                  ? 'text-yellow-600 dark:text-yellow-400 border-yellow-500/30 dark:border-yellow-500/30'
                  : 'text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke',
              ]"
            >
              R:v{{ repeaterVersion.base
              }}{{ repeaterVersion.isDev ? '-dev' + repeaterVersion.devNumber : '' }}
            </span>
            <span
              :class="[
                'glass-card px-2 py-1 text-xs font-medium rounded border transition-colors',
                coreVersion.isDev
                  ? 'text-yellow-600 dark:text-yellow-400 border-yellow-500/30 dark:border-yellow-500/30'
                  : 'text-content-secondary dark:text-content-muted border-stroke-subtle dark:border-stroke',
              ]"
            >
              Core:v{{ coreVersion.base
              }}{{ coreVersion.isDev ? '-dev' + coreVersion.devNumber : '' }}
            </span>
            <svg
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
      </div>

      <div class="border-t border-accent-green mb-4"></div>

      <!-- Duty cycle info - only show when enabled -->
      <div v-if="systemStore.dutyCycleEnabled" class="mb-4">
        <p class="text-content-secondary dark:text-content-muted text-xs mb-2">
          Duty Cycle:
          <span class="text-content-primary dark:text-content-primary"
            >{{ systemStore.dutyCycleUtilization.toFixed(1) }}% /
            {{ systemStore.dutyCycleMax.toFixed(1) }}%</span
          >
        </p>

        <!-- Duty cycle progress bar -->
        <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :style="dutyCycleBarStyle"
          ></div>
        </div>
      </div>

      <div
        class="flex items-center gap-2 text-content-secondary dark:text-content-muted text-xs mb-3"
      >
        <svg class="w-3 h-3" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6.5 13C5.59722 13 4.75174 12.8286 3.96355 12.4858C3.17537 12.143 2.48926 11.6795 1.90522 11.0955C1.32119 10.5115 0.85776 9.82535 0.514945 9.03717C0.172131 8.24898 0.000482491 7.40326 1.0101e-06 6.5C-0.000480471 5.59674 0.171168 4.75126 0.514945 3.96356C0.858723 3.17585 1.32191 2.48974 1.9045 1.90522C2.48709 1.3207 3.1732 0.857278 3.96283 0.514944C4.75246 0.172611 5.59818 0.000962963 6.5 0C7.48703 0 8.42303 0.210648 9.30799 0.631944C10.193 1.05324 10.9421 1.64907 11.5555 2.41944V1.44444C11.5555 1.23981 11.6249 1.06841 11.7635 0.930222C11.9022 0.792037 12.0736 0.722704 12.2778 0.722222C12.4819 0.721741 12.6536 0.791074 12.7927 0.930222C12.9319 1.06937 13.001 1.24078 13 1.44444V4.33333C13 4.53796 12.9307 4.70961 12.792 4.84828C12.6533 4.98694 12.4819 5.05604 12.2778 5.05556H9.38888C9.18425 5.05556 9.01285 4.98622 8.87466 4.84756C8.73647 4.70889 8.66714 4.53748 8.66666 4.33333C8.66618 4.12919 8.73551 3.95778 8.87466 3.81911C9.01381 3.68044 9.18521 3.61111 9.38888 3.61111H10.6528C10.1593 2.93704 9.55138 2.40741 8.82916 2.02222C8.10694 1.63704 7.33055 1.44444 6.5 1.44444C5.09166 1.44444 3.89711 1.93507 2.91633 2.91633C1.93555 3.89759 1.44493 5.09215 1.44444 6.5C1.44396 7.90785 1.93459 9.10265 2.91633 10.0844C3.89807 11.0661 5.09263 11.5565 6.5 11.5556C7.64351 11.5556 8.66666 11.2125 9.56944 10.5264C10.4722 9.84028 11.068 8.95555 11.3569 7.87222C11.4171 7.67963 11.5255 7.53519 11.6819 7.43889C11.8384 7.34259 12.013 7.30648 12.2055 7.33055C12.4102 7.35463 12.5727 7.44178 12.693 7.592C12.8134 7.74222 12.8495 7.90785 12.8014 8.08889C12.4523 9.5213 11.694 10.698 10.5264 11.6191C9.35879 12.5402 8.01666 13.0005 6.5 13ZM7.22222 6.21111L9.02777 8.01667C9.16018 8.14907 9.22638 8.31759 9.22638 8.52222C9.22638 8.72685 9.16018 8.89537 9.02777 9.02778C8.89536 9.16018 8.72685 9.22639 8.52222 9.22639C8.31759 9.22639 8.14907 9.16018 8.01666 9.02778L5.99444 7.00556C5.92222 6.93333 5.86805 6.8522 5.83194 6.76217C5.79583 6.67213 5.77777 6.57872 5.77777 6.48194V3.61111C5.77777 3.40648 5.84711 3.23507 5.98577 3.09689C6.12444 2.9587 6.29585 2.88937 6.5 2.88889C6.70414 2.88841 6.87579 2.95774 7.01494 3.09689C7.15409 3.23604 7.22318 3.40744 7.22222 3.61111V6.21111Z"
            fill="currentColor"
          />
        </svg>
        Last Updated: {{ currentTime }}
      </div>
      
      <div class="flex flex-col items-center justify-center mb-4">
        <p
          class="text-content-muted dark:text-content-muted text-[10px] mb-1 tracking-wide uppercase opacity-70"
        >
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

      <div class="flex items-center justify-center gap-3">
        <a
          href="https://discord.gg/qreAsnmJ"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
          title="Discord"
        >
          <DiscordIcon class="w-5 h-5 text-white group-hover:text-indigo-500 transition-colors" />
        </a>
        <a
          href="https://pymc.dev"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-content-primary dark:bg-white/10 border border-stroke-subtle dark:border-stroke/20 hover:bg-cyan-50 dark:hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300 hover:scale-110 group backdrop-blur-sm"
          title="pyMC Website"
        >
          <svg
            class="w-5 h-5 text-white group-hover:text-cyan-500 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.75"
              d="M12 21a9.004 9.004 0 008.716-6M12 21a9.004 9.004 0 01-8.716-6M12 21c1.656 0 3-4.03 3-9s-1.344-9-3-9m0 18c-1.656 0-3-4.03-3-9s1.344-9 3-9m0 0a9.004 9.004 0 018.716 6M12 3a9.004 9.004 0 00-8.716 6M3.284 9h17.432M3.284 15h17.432"
            />
          </svg>
        </a>
        <a
          href="https://github.com/pyMC-dev/pyMC_Repeater"
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
  </aside>

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

<style scoped>
.sidebar-item-enter-active {
  transition: opacity 200ms ease, transform 200ms ease;
}
.sidebar-item-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
