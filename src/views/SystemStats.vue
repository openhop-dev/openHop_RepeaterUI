<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, markRaw, toRaw } from 'vue';
import ApiService from '@/utils/api';
import { formatBytes } from '@/utils/formatters';
import SparklineChart from '@/components/ui/Sparkline.vue';
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

const updateInterval = ref<number | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);

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

// Chart error states
const cpuChartError = ref(false);
const memoryChartError = ref(false);

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
  try {
    const response = await ApiService.get('/hardware_stats');

    if (response?.success && response.data) {
      const newStats = response.data as HardwareStats;
      hardwareStats.value = newStats;

      // If this is the first data point, seed historical data so charts
      // render a line instead of a single dot. We clone the object to
      // avoid mutating the same reference.
      if (historicalData.value.length === 0) {
        const seedCount = 12;
        for (let i = 0; i < seedCount; i++) {
          // shallow-deep clone via JSON to keep it simple and safe
          historicalData.value.push(JSON.parse(JSON.stringify(newStats)));
        }
      } else {
        // Add to historical data (keep last 20 entries for sparklines)
        historicalData.value.push(newStats);
        if (historicalData.value.length > 20) {
          historicalData.value.shift();
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch hardware stats:', err);
    error.value = 'Failed to fetch hardware stats';
  }
};

// Fetch process data
const fetchProcessStats = async () => {
  try {
    const response = await ApiService.get('/hardware_processes');

    if (response?.success && response.data) {
      // Store previous data for comparison
      previousProcessesData.value = processesData.value;
      processesData.value = response.data as ProcessesResponse;
    }
  } catch (err) {
    console.error('Failed to fetch process stats:', err);
    // Don't set error for process stats as it's not critical
  }
};

// Helper to check if a process value has changed
const hasProcessValueChanged = (process: ProcessInfo, field: keyof ProcessInfo): boolean => {
  if (!previousProcessesData.value) return false;

  const prevProcess = previousProcessesData.value.processes.find((p) => p.pid === process.pid);
  if (!prevProcess) return true; // New process

  return prevProcess[field] !== process[field];
};

// Fetch all data
const fetchAllData = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Fetch both hardware stats and processes
    await Promise.all([fetchHardwareStats(), fetchProcessStats()]);

    isLoading.value = false;

    // Update charts after data is loaded
    await nextTick();
    updateCharts();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch system data';
    isLoading.value = false;
  }
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

  // Update existing chart instead of destroying it
  if (cpuChart.value) {
    try {
      cpuChart.value.data.datasets[0].data = [currentUsage, remaining];
      cpuChart.value.update('none'); // Update without animation to prevent flashing
      return;
    } catch (error) {
      console.warn('Failed to update CPU chart, recreating...', error);
      cpuChart.value.destroy();
      cpuChart.value = null;
    }
  }

  // Theme-aware colors
  const isDarkMode = document.documentElement.classList.contains('dark');
  const availableBgColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const availableBorderColor = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
  const labelColor = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';

  // Create new chart only if one doesn't exist
  try {
    const chartInstance = new ChartJS(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Available'],
        datasets: [
          {
            data: [currentUsage, remaining],
            backgroundColor: ['#FFC246', availableBgColor],
            borderColor: ['#FFC246', availableBorderColor],
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

            // Draw percentage in center
            const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
            const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFC246';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${currentUsage.toFixed(1)}%`, centerX, centerY - 5);

            ctx.fillStyle = labelColor;
            ctx.font = '10px sans-serif';
            ctx.fillText('CPU', centerX, centerY + 12);

            ctx.restore();
          },
        },
      ],
    });

    cpuChart.value = markRaw(chartInstance);
    cpuChartError.value = false;
    chartLoadingStates.value.cpuChart = false;
  } catch (error) {
    console.error('Error creating CPU chart:', error);
    cpuChartError.value = true;
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

  // Update existing chart instead of destroying it
  if (memoryChart.value) {
    try {
      memoryChart.value.data.datasets[0].data = [currentUsage, remaining];
      memoryChart.value.update('none'); // Update without animation to prevent flashing
      return;
    } catch (error) {
      console.warn('Failed to update Memory chart, recreating...', error);
      memoryChart.value.destroy();
      memoryChart.value = null;
    }
  }

  // Theme-aware colors
  const isDarkMode = document.documentElement.classList.contains('dark');
  const availableBgColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const availableBorderColor = isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
  const labelColor = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';

  // Create new chart only if one doesn't exist
  try {
    const chartInstance = new ChartJS(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Available'],
        datasets: [
          {
            data: [currentUsage, remaining],
            backgroundColor: ['#A5E5B6', availableBgColor],
            borderColor: ['#A5E5B6', availableBorderColor],
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

            // Draw percentage in center
            const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
            const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#A5E5B6';
            ctx.font = 'bold 18px sans-serif';
            ctx.fillText(`${currentUsage.toFixed(1)}%`, centerX, centerY - 5);

            ctx.fillStyle = labelColor;
            ctx.font = '10px sans-serif';
            ctx.fillText('Memory', centerX, centerY + 12);

            ctx.restore();
          },
        },
      ],
    });

    memoryChart.value = markRaw(chartInstance);
    memoryChartError.value = false;
    chartLoadingStates.value.memoryChart = false;
  } catch (error) {
    console.error('Error creating Memory chart:', error);
    memoryChartError.value = true;
    chartLoadingStates.value.memoryChart = false;
  }
};

// Disk Chart (using a doughnut chart)
const updateDiskChart = () => {
  if (!diskCanvasRef.value || !hardwareStats.value) {
    return;
  }

  // Theme-aware colors
  const isDarkMode = document.documentElement.classList.contains('dark');
  const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';

  try {
    // Import Plotly dynamically for disk usage pie chart
    import('plotly.js-dist-min').then((PlotlyModule: { default?: any } | any) => {
      const Plotly = PlotlyModule.default || PlotlyModule;
      const disk = hardwareStats.value!.disk;

      const data = [
        {
          type: 'pie',
          labels: ['Used', 'Free'],
          values: [disk.used, disk.free],
          marker: {
            colors: ['#FB787B', '#A5E5B6'],
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
      // Clear Plotly chart if it exists
      try {
        import('plotly.js-dist-min')
          .then((PlotlyModule: { default?: unknown } | unknown) => {
            const Plotly = (PlotlyModule as { default?: any })?.default || (PlotlyModule as any);
            if (Plotly?.purge) {
              Plotly.purge(diskCanvasRef.value!);
            }
          })
          .catch(() => {
            // Ignore errors during cleanup
          });
      } catch {
        // Ignore errors during cleanup
      }
    }
  } catch (e) {
    console.error('Error destroying charts:', e);
  }
};

// Watch for theme changes and rebuild charts
const themeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'class') {
      // Theme changed, rebuild all charts
      destroyAllCharts();
      nextTick(() => {
        updateCharts();
      });
    }
  });
});

onMounted(async () => {
  await nextTick();
  fetchAllData();

  // Update every 5 seconds
  updateInterval.value = window.setInterval(fetchAllData, 5000);

  // Watch for theme changes on the document element
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Add resize listener
  window.addEventListener('resize', () => {
    setTimeout(() => {
      toRaw(cpuChart.value)?.resize();
      toRaw(memoryChart.value)?.resize();

      // Resize Plotly chart if it exists
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
          .catch(() => {
            // Ignore resize errors
          });
      } catch {
        // Ignore resize errors
      }
    }, 100);
  });
});

onBeforeUnmount(() => {
  if (updateInterval.value) {
    clearInterval(updateInterval.value);
  }

  // Disconnect theme observer
  themeObserver.disconnect();

  destroyAllCharts();
  window.removeEventListener('resize', () => {});
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
        color="#FFC246"
        :data="sparklineData.cpu"
      />

      <!-- Memory Usage -->
      <SparklineChart
        title="Memory Usage"
        :value="`${systemStats.memoryUsage.toFixed(1)}%`"
        color="#A5E5B6"
        :data="sparklineData.memory"
      />

      <!-- Disk Usage -->
      <SparklineChart
        title="Disk Usage"
        :value="`${systemStats.diskUsage.toFixed(1)}%`"
        color="#FB787B"
        :data="sparklineData.disk"
      />

      <!-- System Uptime -->
      <SparklineChart
        title="Uptime"
        :value="formatUptime(systemStats.uptime)"
        color="#EBA0FC"
        :data="sparklineData.network"
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
        <div
          class="relative h-32 bg-gray-100/50 dark:bg-white/5 rounded-lg p-4 mb-4 chart-container"
        >
          <canvas ref="cpuCanvasRef" class="w-full h-full relative z-10"></canvas>

          <!-- Loading Spinner -->
          <div
            v-if="chartLoadingStates.cpuChart"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-sm z-20"
          >
            <div class="text-center">
              <div
                class="animate-spin w-6 h-6 border-2 border-stroke-subtle dark:border-stroke/20 border-t-orange-400 rounded-full mx-auto mb-2"
              ></div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Loading CPU data...
              </div>
            </div>
          </div>

          <!-- Error overlay -->
          <div
            v-if="cpuChartError && !chartLoadingStates.cpuChart"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 z-20"
          >
            <div class="text-center">
              <div class="text-red-500 dark:text-red-400 text-sm mb-1">No Data Available</div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                CPU data not found
              </div>
            </div>
          </div>
        </div>

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
        <div
          class="relative h-32 bg-gray-100/50 dark:bg-white/5 rounded-lg p-4 mb-4 chart-container"
        >
          <canvas ref="memoryCanvasRef" class="w-full h-full relative z-10"></canvas>

          <!-- Loading Spinner -->
          <div
            v-if="chartLoadingStates.memoryChart"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 backdrop-blur-sm z-20"
          >
            <div class="text-center">
              <div
                class="animate-spin w-6 h-6 border-2 border-stroke-subtle dark:border-stroke/20 border-t-green-400 rounded-full mx-auto mb-2"
              ></div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Loading memory data...
              </div>
            </div>
          </div>

          <!-- Error overlay -->
          <div
            v-if="memoryChartError && !chartLoadingStates.memoryChart"
            class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-white/5 z-20"
          >
            <div class="text-center">
              <div class="text-red-500 dark:text-red-400 text-sm mb-1">No Data Available</div>
              <div class="text-content-secondary dark:text-content-muted text-xs">
                Memory data not found
              </div>
            </div>
          </div>
        </div>

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
            <div class="font-semibold text-red-500 dark:text-red-400">
              {{ formatBytes(hardwareStats.disk.used) }}
            </div>
          </div>
          <div class="text-center">
            <div class="text-content-secondary dark:text-content-muted">Free</div>
            <div class="font-semibold text-green-700 dark:text-green-400">
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
                class="text-center text-orange-500 dark:text-orange-400 py-2 transition-all duration-300"
              >
                <span
                  class="cpu-value"
                  :class="{ 'value-updated': hasProcessValueChanged(process, 'cpu_percent') }"
                >
                  {{ process.cpu_percent.toFixed(1) }}%
                </span>
              </td>
              <td
                class="text-center text-green-700 dark:text-green-400 py-2 transition-all duration-300"
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
        v-else-if="!isLoading"
        class="text-center text-content-secondary dark:text-content-muted py-8"
      >
        No process data available
      </div>
    </div>

    <!-- Loading/Error States -->
    <div v-if="isLoading" class="glass-card rounded-[15px] p-8 text-center">
      <div class="text-content-secondary dark:text-content-muted mb-2">
        Loading system statistics...
      </div>
      <div
        class="animate-spin w-8 h-8 border-2 border-stroke-subtle dark:border-stroke/20 border-t-gray-900 dark:border-t-white/70 rounded-full mx-auto"
      ></div>
    </div>

    <div v-if="error" class="glass-card rounded-[15px] p-8 text-center">
      <div class="text-red-500 dark:text-red-400 mb-2">Failed to load system statistics</div>
      <p class="text-content-secondary dark:text-content-muted text-sm">{{ error }}</p>
      <button
        @click="fetchAllData"
        class="mt-4 px-4 py-2 bg-purple-500/20 dark:bg-accent-purple/20 hover:bg-purple-500/30 dark:hover:bg-accent-purple/30 text-content-primary dark:text-content-primary rounded-lg border border-purple-500/50 dark:border-accent-purple/50 transition-colors"
      >
        Retry
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Additional styling for system stats specific elements */
.glass-card {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.dark .glass-card {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: none;
}

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

/* Enhanced chart container styling */
.chart-container {
  position: relative;
  transition: all 0.3s ease;
}

.chart-container:hover {
  background: rgba(0, 0, 0, 0.04);
}

.dark .chart-container:hover {
  background: rgba(255, 255, 255, 0.08);
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
  background: rgba(245, 158, 11, 0.1);
  transform: scale(1.05);
}

/* Subtle glow effect for updated values */
@keyframes value-update {
  0% {
    background: rgba(245, 158, 11, 0.3);
  }
  100% {
    background: transparent;
  }
}

.value-updated {
  animation: value-update 0.6s ease-out;
}
</style>
