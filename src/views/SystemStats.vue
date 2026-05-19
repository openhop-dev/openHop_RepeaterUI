<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, markRaw, toRaw, watch } from 'vue';
import { streamingGet } from '@/utils/streamingFetch';
import { formatBytes } from '@/utils/formatters';
import SparklineChart from '@/components/ui/Sparkline.vue';
import ChartCard from '@/components/ui/ChartCard.vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  DoughnutController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  Filler,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { useManagedPolling } from '@/composables/useManagedPolling';
import { useTheme } from '@/composables/useTheme';

defineOptions({ name: 'SystemStatsView' });

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  DoughnutController,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
  Filler,
  TimeScale,
);

interface HardwareStats {
  cpu: {
    usage_percent: number;
    count: number;
    frequency: number;
    load_avg: {
      '1min': number;
      '5min': number;
      '15min': number;
    };
  };
  memory: {
    total: number;
    available: number;
    used: number;
    usage_percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage_percent: number;
  };
  network: {
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
  };
  system: {
    uptime: number;
    boot_time: number;
  };
  temperatures?: {
    [key: string]: number;
  };
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_percent: number;
  memory_mb: number;
}

interface ProcessesResponse {
  processes: ProcessInfo[];
  total_processes: number;
}

const { theme } = useTheme();

// Theme-aware chrome colours (axis labels, legend text). Re-evaluated at chart creation/rebuild time.
const getChartChrome = () => {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    labelColor: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
    textColor:  isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
  };
};

// Chart palette — fixed vibrant colours, same in both light and dark mode.
// Matches the pattern used in Statistics.vue and StatsCards.vue.
const CHART_COLORS = {
  cpu:    '#FFC246',
  memory: '#A5E5B6',
  disk:   '#FB787B', // matches "Dropped" in Dashboard StatsCards
  free:   '#A5E5B6',
  uptime: '#EBA0FC',
} as const;

// Hardware stats data
const hardwareStats = ref<HardwareStats | null>(null);
const processesData = ref<ProcessesResponse | null>(null);
const historicalData = ref<HardwareStats[]>([]);
const previousProcessesData = ref<ProcessesResponse | null>(null);

// Chart loading states
const chartLoadingStates = ref({
  cpuChart: true,
  memoryChart: true,
  diskChart: false,
  processChart: true,
});

// Per-chart error and status states
const cpuChartError = ref<string | null>(null);
const memoryChartError = ref<string | null>(null);
const cpuChartStatus = ref('Connecting...');
const memoryChartStatus = ref('Connecting...');

// Chart instances
const cpuChart = ref<ChartJS | null>(null);
const memoryChart = ref<ChartJS | null>(null);

// Canvas refs
const cpuCanvasRef = ref<HTMLCanvasElement | null>(null);
const memoryCanvasRef = ref<HTMLCanvasElement | null>(null);
const diskCanvasRef = ref<HTMLDivElement | null>(null);

// Computed values for cards
const systemStats = computed(() => {
  if (!hardwareStats.value) {
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      uptime: 0,
    };
  }

  return {
    cpuUsage: hardwareStats.value.cpu.usage_percent,
    memoryUsage: hardwareStats.value.memory.usage_percent,
    diskUsage: hardwareStats.value.disk.usage_percent,
    uptime: hardwareStats.value.system.uptime,
  };
});

// Sparkline data from historical stats
const sparklineData = computed(() => {
  if (historicalData.value.length === 0) {
    return {
      cpu: [],
      memory: [],
      disk: [],
      network: [],
    };
  }

  return {
    cpu: historicalData.value.map((stat) => stat.cpu.usage_percent),
    memory: historicalData.value.map((stat) => stat.memory.usage_percent),
    disk: historicalData.value.map((stat) => stat.disk.usage_percent),
    network: historicalData.value.map((stat) => stat.network.bytes_recv / 1024 / 1024), // MB
  };
});

const windowLabel = computed(() => {
  const n = historicalData.value.length;
  if (n < 2) return '';
  const seconds = n * 5;
  return seconds < 120 ? `last ${seconds}s` : `last ${Math.round(seconds / 60)}m`;
});

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else {
    return `${mins}m`;
  }
};

// Fetch hardware stats
const fetchHardwareStats = async () => {
  cpuChartStatus.value = 'Connecting...';
  memoryChartStatus.value = 'Connecting...';
  try {
    const response = await streamingGet('/hardware_stats', undefined, {
      onPhaseChange: (phase) => {
        const status = phase === 'receiving' ? 'Receiving data...' : 'Connecting...';
        cpuChartStatus.value = status;
        memoryChartStatus.value = status;
      },
    });

    if (response?.success && response.data) {
      const newStats = response.data as HardwareStats;
      hardwareStats.value = newStats;

      historicalData.value.push(newStats);
      if (historicalData.value.length > 20) {
        historicalData.value.shift();
      }

      cpuChartError.value = null;
      memoryChartError.value = null;
      await nextTick();
      updateCharts();
    } else {
      cpuChartError.value = 'No data in server response';
      memoryChartError.value = 'No data in server response';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load data';
    cpuChartError.value = msg;
    memoryChartError.value = msg;
  } finally {
    chartLoadingStates.value.cpuChart = false;
    chartLoadingStates.value.memoryChart = false;
  }
};

// Fetch process data
const fetchProcessStats = async () => {
  try {
    const response = await streamingGet('/hardware_processes');

    if (response?.success && response.data) {
      previousProcessesData.value = processesData.value;
      processesData.value = response.data as ProcessesResponse;
    }
  } catch (err) {
    console.error('Failed to fetch process stats:', err);
  } finally {
    chartLoadingStates.value.processChart = false;
  }
};

// Helper to check if a process value has changed
const hasProcessValueChanged = (process: ProcessInfo, field: keyof ProcessInfo): boolean => {
  if (!previousProcessesData.value) return false;

  const prevProcess = previousProcessesData.value.processes.find((p) => p.pid === process.pid);
  if (!prevProcess) return true; // New process

  return prevProcess[field] !== process[field];
};

// Fire both fetches independently — no Promise.all bottleneck
const fetchAllData = () => {
  void fetchHardwareStats();
  void fetchProcessStats();
};

// Update all charts
const updateCharts = () => {
  if (hardwareStats.value) {
    updateCpuChart();
    updateMemoryChart();
    updateDiskChart();
  }
};

// CPU Chart
const updateCpuChart = () => {
  if (!cpuCanvasRef.value || !hardwareStats.value) {
    chartLoadingStates.value.cpuChart = false;
    return;
  }

  const ctx = cpuCanvasRef.value.getContext('2d');
  if (!ctx) {
    chartLoadingStates.value.cpuChart = false;
    return;
  }

  const currentUsage = hardwareStats.value.cpu.usage_percent;
  const remaining = 100 - currentUsage;

  if (cpuChart.value) {
    try {
      cpuChart.value.data.datasets[0].data = [currentUsage, remaining];
      cpuChart.value.update('none');
      return;
    } catch (error) {
      console.warn('Failed to update CPU chart, recreating...', error);
      cpuChart.value.destroy();
      cpuChart.value = null;
    }
  }

  const cpuColor = CHART_COLORS.cpu;
  const chrome = getChartChrome();
  const isDark = document.documentElement.classList.contains('dark');
  const availableBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const availableBorder = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';

  try {
    const chartInstance = new ChartJS(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Available'],
        datasets: [
          {
            data: [currentUsage, remaining],
            backgroundColor: [cpuColor, availableBg],
            borderColor: [cpuColor, availableBorder],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        animation: {
          animateRotate: false,
          animateScale: false,
          duration: 0,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ${context.parsed.toFixed(1)}%`;
              },
            },
          },
        },
      },
      plugins: [
        {
          id: 'centerText',
          beforeDraw: function (chart) {
            const ctx = chart.ctx;
            ctx.save();

            const liveUsage = chart.data.datasets[0].data[0] as number;
            const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
            const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = cpuColor;
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${liveUsage.toFixed(1)}%`, centerX, centerY - 5);

            ctx.fillStyle = chrome.labelColor;
            ctx.font = '10px sans-serif';
            ctx.fillText('CPU', centerX, centerY + 12);

            ctx.restore();
          },
        },
      ],
    });

    cpuChart.value = markRaw(chartInstance);
    cpuChartError.value = null;
    chartLoadingStates.value.cpuChart = false;
  } catch (error) {
    console.error('Error creating CPU chart:', error);
    cpuChartError.value = 'Failed to create CPU chart';
    chartLoadingStates.value.cpuChart = false;
  }
};

// Memory Chart
const updateMemoryChart = () => {
  if (!memoryCanvasRef.value || !hardwareStats.value) {
    chartLoadingStates.value.memoryChart = false;
    return;
  }

  const ctx = memoryCanvasRef.value.getContext('2d');
  if (!ctx) {
    chartLoadingStates.value.memoryChart = false;
    return;
  }

  const currentUsage = hardwareStats.value.memory.usage_percent;
  const remaining = 100 - currentUsage;

  if (memoryChart.value) {
    try {
      memoryChart.value.data.datasets[0].data = [currentUsage, remaining];
      memoryChart.value.update('none');
      return;
    } catch (error) {
      console.warn('Failed to update Memory chart, recreating...', error);
      memoryChart.value.destroy();
      memoryChart.value = null;
    }
  }

  const memoryColor = CHART_COLORS.memory;
  const chrome = getChartChrome();
  const isDark = document.documentElement.classList.contains('dark');
  const availableBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const availableBorder = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';

  try {
    const chartInstance = new ChartJS(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Available'],
        datasets: [
          {
            data: [currentUsage, remaining],
            backgroundColor: [memoryColor, availableBg],
            borderColor: [memoryColor, availableBorder],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        animation: {
          animateRotate: false,
          animateScale: false,
          duration: 0,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return `${context.label}: ${context.parsed.toFixed(1)}%`;
              },
            },
          },
        },
      },
      plugins: [
        {
          id: 'centerText',
          beforeDraw: function (chart) {
            const ctx = chart.ctx;
            ctx.save();

            const liveUsage = chart.data.datasets[0].data[0] as number;
            const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
            const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = memoryColor;
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${liveUsage.toFixed(1)}%`, centerX, centerY - 5);

            ctx.fillStyle = chrome.labelColor;
            ctx.font = '10px sans-serif';
            ctx.fillText('Memory', centerX, centerY + 12);

            ctx.restore();
          },
        },
      ],
    });

    memoryChart.value = markRaw(chartInstance);
    memoryChartError.value = null;
    chartLoadingStates.value.memoryChart = false;
  } catch (error) {
    console.error('Error creating Memory chart:', error);
    memoryChartError.value = 'Failed to create Memory chart';
    chartLoadingStates.value.memoryChart = false;
  }
};

// Disk Chart (Plotly)
const updateDiskChart = () => {
  if (!diskCanvasRef.value || !hardwareStats.value) {
    return;
  }

  const textColor = getChartChrome().textColor;

  try {
    import('plotly.js-dist-min').then((PlotlyModule: { default?: any } | any) => {
      const Plotly = PlotlyModule.default || PlotlyModule;
      const disk = hardwareStats.value!.disk;

      const data = [
        {
          type: 'pie',
          labels: ['Used', 'Free'],
          values: [disk.used, disk.free],
          marker: {
            colors: [CHART_COLORS.disk, CHART_COLORS.free],
          },
          hovertemplate:
            '<b>%{label}</b><br>Size: %{value}<br>Percentage: %{percent}<extra></extra>',
          textinfo: 'label+percent',
          textposition: 'auto',
          hole: 0.4,
        },
      ];

      const layout = {
        title: {
          text: '',
          font: { color: textColor },
        },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
          color: textColor,
          size: 11,
        },
        margin: { t: 20, b: 20, l: 20, r: 20 },
        showlegend: true,
        legend: {
          orientation: 'h',
          x: 0,
          y: -0.2,
          font: {
            color: textColor,
            size: 10,
          },
        },
      };

      const config = {
        responsive: true,
        displayModeBar: false,
        staticPlot: false,
      };

      Plotly.newPlot(diskCanvasRef.value!, data, layout, config);
    });
  } catch (error) {
    console.error('Error creating disk chart:', error);
  }
};

// Destroy all charts
const destroyAllCharts = () => {
  try {
    if (cpuChart.value) {
      cpuChart.value.destroy();
      cpuChart.value = null;
    }
    if (memoryChart.value) {
      memoryChart.value.destroy();
      memoryChart.value = null;
    }
    if (diskCanvasRef.value) {
      try {
        import('plotly.js-dist-min')
          .then((PlotlyModule: { default?: unknown } | unknown) => {
            const Plotly = (PlotlyModule as { default?: any })?.default || (PlotlyModule as any);
            if (Plotly?.purge) {
              Plotly.purge(diskCanvasRef.value!);
            }
          })
          .catch(() => {});
      } catch {
        // Ignore errors during cleanup
      }
    }
  } catch (e) {
    console.error('Error destroying charts:', e);
  }
};

// Rebuild charts when theme changes
watch(theme, () => {
  destroyAllCharts();
  nextTick(() => updateCharts());
});

// Stored resize handler — named reference required for removeEventListener to work
const handleResize = () => {
  setTimeout(() => {
    toRaw(cpuChart.value)?.resize();
    toRaw(memoryChart.value)?.resize();

    try {
      import('plotly.js-dist-min')
        .then((PlotlyModule: { default?: unknown } | unknown) => {
          const Plotly = (PlotlyModule as { default?: unknown })?.default || PlotlyModule;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((Plotly as any)?.Plots) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (Plotly as any).Plots.resize(diskCanvasRef.value!);
          }
        })
        .catch(() => {});
    } catch {
      // Ignore resize errors
    }
  }, 100);
};

useManagedPolling(fetchAllData, { intervalMs: 5000, immediate: true });

onMounted(async () => {
  await nextTick();
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize);
  destroyAllCharts();
});
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <h2 class="text-2xl font-bold text-content-primary dark:text-content-primary">
        System Statistics
      </h2>
      <div class="text-content-secondary dark:text-content-muted text-sm">
        Updates every 5 seconds
      </div>
    </div>

    <!-- Top Stats Cards with Sparklines -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- CPU Usage -->
      <SparklineChart
        title="CPU Usage"
        :value="`${systemStats.cpuUsage.toFixed(1)}%`"
        :color="CHART_COLORS.cpu"
        :data="sparklineData.cpu"
        :min-y="0"
        :max-y="100"
        :subtitle="windowLabel"
      />

      <!-- Memory Usage -->
      <SparklineChart
        title="Memory Usage"
        :value="`${systemStats.memoryUsage.toFixed(1)}%`"
        :color="CHART_COLORS.memory"
        :data="sparklineData.memory"
        :min-y="0"
        :max-y="100"
        :subtitle="windowLabel"
      />

      <!-- Disk Usage -->
      <SparklineChart
        title="Disk Usage"
        :value="`${systemStats.diskUsage.toFixed(1)}%`"
        :color="CHART_COLORS.disk"
        :data="sparklineData.disk"
        :min-y="0"
        :max-y="100"
        :subtitle="windowLabel"
      />

      <!-- System Uptime -->
      <SparklineChart
        title="Uptime"
        :value="formatUptime(systemStats.uptime)"
        :color="CHART_COLORS.uptime"
        :data="[]"
        :show-chart="false"
      />
    </div>

    <!-- System Information Cards -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- CPU Details -->
      <div class="glass-card rounded-[15px] p-6">
        <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold mb-4">
          CPU Performance
        </h3>

        <!-- CPU Chart -->
        <ChartCard
          class="h-32 mb-4"
          :is-loading="chartLoadingStates.cpuChart"
          :error="cpuChartError"
          :status="cpuChartStatus"
          @retry="fetchHardwareStats"
        >
          <canvas ref="cpuCanvasRef" class="w-full h-full"></canvas>
        </ChartCard>

        <!-- CPU Stats -->
        <div v-if="hardwareStats" class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-content-secondary dark:text-content-muted">CPU Count</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ hardwareStats.cpu.count }} cores
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Frequency</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ hardwareStats.cpu.frequency.toFixed(0) }} MHz
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Load (1m)</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ hardwareStats.cpu.load_avg['1min'].toFixed(2) }}
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Load (5m)</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ hardwareStats.cpu.load_avg['5min'].toFixed(2) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Memory Details -->
      <div class="glass-card rounded-[15px] p-6">
        <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold mb-4">
          Memory Usage
        </h3>

        <!-- Memory Chart -->
        <ChartCard
          class="h-32 mb-4"
          :is-loading="chartLoadingStates.memoryChart"
          :error="memoryChartError"
          :status="memoryChartStatus"
          @retry="fetchHardwareStats"
        >
          <canvas ref="memoryCanvasRef" class="w-full h-full"></canvas>
        </ChartCard>

        <!-- Memory Stats -->
        <div v-if="hardwareStats" class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-content-secondary dark:text-content-muted">Total</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ formatBytes(hardwareStats.memory.total) }}
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Used</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ formatBytes(hardwareStats.memory.used) }}
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Available</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ formatBytes(hardwareStats.memory.available) }}
            </div>
          </div>
          <div>
            <div class="text-content-secondary dark:text-content-muted">Usage</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ hardwareStats.memory.usage_percent.toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Storage and Network Section -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Disk Usage -->
      <div class="glass-card rounded-[15px] p-6">
        <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold mb-4">
          Storage Usage
        </h3>

        <!-- Disk Chart -->
        <div class="relative h-48">
          <div ref="diskCanvasRef" class="w-full h-full"></div>
        </div>

        <!-- Disk Stats -->
        <div v-if="hardwareStats" class="grid grid-cols-3 gap-4 text-sm mt-4">
          <div class="text-center">
            <div class="text-content-secondary dark:text-content-muted">Total</div>
            <div class="text-content-primary dark:text-content-primary font-semibold">
              {{ formatBytes(hardwareStats.disk.total) }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-content-secondary dark:text-content-muted">Used</div>
            <div class="font-semibold text-accent-red">
              {{ formatBytes(hardwareStats.disk.used) }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-content-secondary dark:text-content-muted">Free</div>
            <div class="font-semibold text-accent-green">
              {{ formatBytes(hardwareStats.disk.free) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Network Stats -->
      <div class="glass-card rounded-[15px] p-6">
        <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold mb-4">
          Network Statistics
        </h3>

        <div v-if="hardwareStats" class="space-y-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-content-secondary dark:text-content-muted">Bytes Sent</div>
              <div class="text-content-primary dark:text-content-primary font-semibold">
                {{ formatBytes(hardwareStats.network.bytes_sent) }}
              </div>
            </div>
            <div>
              <div class="text-content-secondary dark:text-content-muted">Bytes Received</div>
              <div class="text-content-primary dark:text-content-primary font-semibold">
                {{ formatBytes(hardwareStats.network.bytes_recv) }}
              </div>
            </div>
            <div>
              <div class="text-content-secondary dark:text-content-muted">Packets Sent</div>
              <div class="text-content-primary dark:text-content-primary font-semibold">
                {{ hardwareStats.network.packets_sent.toLocaleString() }}
              </div>
            </div>
            <div>
              <div class="text-content-secondary dark:text-content-muted">Packets Received</div>
              <div class="text-content-primary dark:text-content-primary font-semibold">
                {{ hardwareStats.network.packets_recv.toLocaleString() }}
              </div>
            </div>
          </div>

          <!-- Temperature if available -->
          <div
            v-if="hardwareStats.temperatures && Object.keys(hardwareStats.temperatures).length > 0"
            class="pt-4 border-t border-stroke-subtle dark:border-stroke/10"
          >
            <div class="text-content-secondary dark:text-content-muted mb-2">
              System Temperatures
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div v-for="(temp, sensor) in hardwareStats.temperatures" :key="sensor">
                <span class="text-content-secondary dark:text-content-muted">{{ sensor }}:</span>
                <span class="text-content-primary dark:text-content-primary font-semibold ml-1"
                  >{{ temp.toFixed(1) }}°C</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Top Processes Section -->
    <div class="glass-card rounded-[15px] p-6">
      <h3 class="text-content-primary dark:text-content-primary text-xl font-semibold mb-4">
        Top Processes
      </h3>

      <div
        v-if="processesData?.processes && processesData.processes.length > 0"
        class="overflow-x-auto"
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-stroke-subtle dark:border-stroke/10">
              <th class="text-left text-content-secondary dark:text-content-muted py-2">PID</th>
              <th class="text-left text-content-secondary dark:text-content-muted py-2">Name</th>
              <th class="text-center text-content-secondary dark:text-content-muted py-2">CPU %</th>
              <th class="text-center text-content-secondary dark:text-content-muted py-2">
                Memory %
              </th>
              <th class="text-right text-content-secondary dark:text-content-muted py-2">Memory</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="process in processesData.processes.slice(0, 10)"
              :key="process.pid"
              class="border-b border-stroke-subtle dark:border-white/5 process-row"
            >
              <td
                class="text-content-secondary dark:text-content-primary/80 py-2 transition-all duration-300"
              >
                {{ process.pid }}
              </td>
              <td
                class="text-content-primary dark:text-content-primary font-semibold py-2 transition-all duration-300"
              >
                {{ process.name }}
              </td>
              <td
                class="text-center text-secondary py-2 transition-all duration-300"
              >
                <span
                  class="cpu-value"
                  :class="{ 'value-updated': hasProcessValueChanged(process, 'cpu_percent') }"
                >
                  {{ process.cpu_percent.toFixed(1) }}%
                </span>
              </td>
              <td
                class="text-center text-accent-green py-2 transition-all duration-300"
              >
                <span
                  class="memory-value"
                  :class="{ 'value-updated': hasProcessValueChanged(process, 'memory_percent') }"
                >
                  {{ process.memory_percent.toFixed(1) }}%
                </span>
              </td>
              <td
                class="text-right text-content-secondary dark:text-content-primary/80 py-2 transition-all duration-300"
              >
                <span :class="{ 'value-updated': hasProcessValueChanged(process, 'memory_mb') }">
                  {{ process.memory_mb.toFixed(1) }} MB
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div
          v-if="processesData.total_processes"
          class="mt-4 text-center text-content-secondary dark:text-content-muted text-sm transition-all duration-300"
        >
          Showing top 10 of {{ processesData.total_processes }} total processes
        </div>
      </div>

      <div
        v-else-if="!chartLoadingStates.processChart"
        class="text-center text-content-secondary dark:text-content-muted py-8"
      >
        No process data available
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Subtle pulse animation for chart containers */
.chart-updating {
  animation: subtle-pulse 0.8s ease-in-out;
}

@keyframes subtle-pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
  100% {
    transform: scale(1);
  }
}

/* Process table animations */
.process-row {
  transition: all 0.3s ease;
}

.process-row:hover {
  background: rgba(0, 0, 0, 0.02);
  transform: translateX(2px);
}

.dark .process-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Vue transition animations for process rows */
.process-row-enter-active,
.process-row-leave-active {
  transition: all 0.4s ease;
}

.process-row-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}

.process-row-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

.process-row-move {
  transition: transform 0.4s ease;
}

/* Highlight changing values */
.cpu-value,
.memory-value {
  transition: all 0.3s ease;
  padding: 2px 6px;
  border-radius: 4px;
}

.cpu-value:hover,
.memory-value:hover {
  background: color-mix(in srgb, var(--color-secondary) 10%, transparent);
  transform: scale(1.05);
}

/* Subtle glow effect for updated values */
@keyframes value-update {
  0% {
    background: color-mix(in srgb, var(--color-secondary) 30%, transparent);
  }
  100% {
    background: transparent;
  }
}

.value-updated {
  animation: value-update 0.6s ease-out;
}
</style>
