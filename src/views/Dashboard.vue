<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ApiService from '@/utils/api';
import { useMultiRadioConfig } from '@/composables/useMultiRadioConfig';
import StatsCards from '@/components/ui/StatsCards.vue';
import PacketTypesChart from '@/components/charts/PacketTypesChart.vue';
import AirtimeUtilizationChart from '@/components/charts/AirtimeUtilizationChart.vue';
import PacketTable from '@/components/tables/PacketTable.vue';

defineOptions({ name: 'DashboardView' });

const router = useRouter();
const { radios: configuredRadios } = useMultiRadioConfig();

// A Fabric bridge draws one airtime graph per radio, which needs the full row;
// Packet Types then takes its own row underneath.
const isFabricBridge = computed(() => configuredRadios.value.length > 1);
const pluginManagerUnavailable = ref(false);
const pluginManagerIssue = ref<string | null>(null);
const checkingPluginManager = ref(false);
const pluginManagerFixCommand = 'sudo bash ./manage.sh upgrade';

async function checkPluginManager() {
  if (checkingPluginManager.value) return;
  checkingPluginManager.value = true;
  pluginManagerIssue.value = null;
  try {
    const res = await ApiService.listPlugins();
    if (res.success === false) {
      throw new Error(res.error || 'Failed to load plugin manager status');
    }
    pluginManagerUnavailable.value = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load plugin manager status';
    pluginManagerIssue.value = message;
    pluginManagerUnavailable.value = /unavailable|503/i.test(message);
  } finally {
    checkingPluginManager.value = false;
  }
}

function openPluginsPage() {
  void router.push('/plugins');
}

onMounted(() => {
  void checkPluginManager();
});
</script>

<template>
  <div>
    <div
      v-if="pluginManagerUnavailable"
      class="mb-4 rounded-[15px] border border-accent-amber/opacity-medium bg-accent-amber/opacity-light p-4 text-sm text-content-primary shadow-sm"
      role="alert"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="font-semibold text-accent-amber">Plugin manager is unavailable</p>
          <p class="mt-1 text-content-secondary dark:text-content-muted">
            The repeater is still running, but plugin lifecycle actions are offline until the
            <code class="mx-1">openhop-plugin-manager</code>
            service is restarted and enabled.
          </p>
          <p class="mt-2 text-content-secondary dark:text-content-muted">
            Fix it by running the native upgrade helper from the host source checkout that installed
            this repeater:
            <code
              class="mx-1 rounded bg-black/10 px-1.5 py-0.5 text-content-primary dark:bg-white/10"
            >
              {{ pluginManagerFixCommand }}
            </code>
            That upgrade step installs the missing service unit before enabling it.
          </p>
          <p class="mt-2 text-content-secondary dark:text-content-muted">
            If that checkout is missing or very old, clone a fresh copy first on the host, then
            rerun the upgrade. If it already exists and is only slightly out of date, update it
            first instead. For example:
          </p>
          <pre
            class="mt-2 rounded bg-black/10 px-3 py-2 text-xs leading-5 text-content-primary dark:bg-white/10 whitespace-pre-wrap overflow-x-auto"
          >
cd openhop_repeater/
git pull
git switch dev
sudo ./manage.sh upgrade
          </pre>
          <p class="mt-2 text-content-secondary dark:text-content-muted">
            Then refresh the dashboard.
          </p>
          <p v-if="pluginManagerIssue" class="mt-2 text-xs text-content-muted">
            {{ pluginManagerIssue }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary inline-flex items-center gap-2" @click="openPluginsPage">
            Open Plugins
          </button>
          <button class="btn-secondary inline-flex items-center gap-2" @click="checkPluginManager">
            Retry
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <StatsCards />

    <!-- Charts Row -->
    <div v-if="isFabricBridge" class="mb-2 flex flex-col gap-4">
      <AirtimeUtilizationChart />
      <PacketTypesChart />
    </div>
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-2">
      <AirtimeUtilizationChart />
      <PacketTypesChart />
    </div>

    <!-- Packet Table -->
    <PacketTable />
  </div>
</template>
