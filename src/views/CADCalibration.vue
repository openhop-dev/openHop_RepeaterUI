<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed } from 'vue';
import { ApiService, API_SERVER_URL } from '@/utils/api';
import { useSystemStore } from '@/stores/system';
import { getToken } from '@/utils/auth';
import RestartModal from '@/components/modals/RestartModal.vue';

defineOptions({ name: 'CADCalibrationView' });

const systemStore = useSystemStore();

interface CalibrationResult {
  det_peak: number;
  det_min: number;
  detection_rate: number;
  detections: number;
  non_detections: number;
  timeouts: number;
  errors: number;
  attempts: number;
  samples: number;
}

function toggleProcessLog() {
  showProcessLogExpanded.value = !showProcessLogExpanded.value;
}

interface RangeInfo {
  spreading_factor: number;
  bandwidth?: number;
  frequency?: number;
  current_peak?: number;
  current_min?: number;
  cad_symbol_num?: number;
  known_signal_present?: boolean;
  total_tests?: number;
  peak_min: number;
  peak_max: number;
  min_min: number;
  min_max: number;
}

interface CalibrationUpdate {
  type: 'status' | 'progress' | 'result' | 'complete' | 'completed' | 'error';
  message?: string;
  results?: {
    best?: CalibrationResult;
    recommended?: CalibrationResult;
    recommendation_reason?: string;
    known_signal_present?: boolean;
    signal_activity_observed?: boolean;
    known_signal_effective?: boolean;
    quiet_mode_invalid?: boolean;
    quiet_mode_invalid_reason?: string;
    aggregate_detection_rate?: number;
    qualification?: string;
    total_tests?: number;
  };
  test_ranges?: RangeInfo;
  current?: number;
  total?: number;
  det_peak?: number;
  det_min?: number;
  detection_rate?: number;
  detections?: number;
  non_detections?: number;
  timeouts?: number;
  errors?: number;
  attempts?: number;
  samples?: number;
}

interface LogEvent {
  level: 'info' | 'progress' | 'error';
  text: string;
  ts: number;
}

const isRunning = ref(false);
const startTime = ref<number | null>(null);
const eventSource = ref<EventSource | null>(null);
const calibrationData = ref<Record<string, CalibrationResult>>({});
const bestCalibrationResult = ref<CalibrationResult | null>(null);
const backendRecommendedResult = ref<CalibrationResult | null>(null);
const processLog = ref<LogEvent[]>([]);

const statusMessage = ref('Ready to start calibration');
const progressCurrent = ref(0);
const progressTotal = ref(0);
const testsCompleted = ref(0);
const bestRate = ref(0);
const avgRate = ref(0);
const elapsedTime = ref(0);
const totalAttempts = ref(0);
const totalDetections = ref(0);
const totalNonDetections = ref(0);
const totalTimeouts = ref(0);
const totalErrors = ref(0);
const quietModeInvalid = ref(false);
const quietModeInvalidReason = ref('');
const knownSignalPresent = ref(false);
const recommendationMessage = ref('');
const showActivityPrompt = ref(false);
const activityPromptContext = ref<'prestart' | 'no-detection' | 'limited-data' | 'no-known-signal'>('prestart');
const showNoDetectionGuidance = ref(false);
const showProcessLogExpanded = ref(false);
const showManualCadModal = ref(false);
const showCadInfoModal = ref(false);
const showCadInfoDetails = ref(false);
const dontShowCadInfoAgain = ref(false);
const manualCheckRunning = ref(false);
const manualCheckBusy = ref(false);
const manualDetPeak = ref(22);
const manualDetMin = ref(10);
const manualCadSymbolNum = ref<1 | 2 | 4 | 8 | 16>(2);
const manualCadTimeoutMs = ref(500);
const manualIntervalMs = ref(250);
const manualApplyLive = ref(true);
const manualAttempts = ref(0);
const manualDetections = ref(0);
const manualTimeouts = ref(0);
const manualErrors = ref(0);
const manualRecentOutcomes = ref<boolean[]>([]);
const manualWindowSize = 20;
let manualCheckTimer: ReturnType<typeof setTimeout> | null = null;

const rangeInfo = ref<RangeInfo | null>(null);
const showRangeInfo = ref(false);
const showResults = ref(false);
const showBestResult = ref(false);

let elapsedTimer: ReturnType<typeof setInterval> | null = null;

const progressPercent = computed(() =>
  progressTotal.value > 0 ? Math.min(100, (progressCurrent.value / progressTotal.value) * 100) : 0,
);
const KNOWN_SIGNAL_REQUIRED_DETECTION_RATE = 85;

const rankedCandidates = computed(() =>
  Object.values(calibrationData.value)
    .sort((a, b) => {
      if (activeKnownSignalMode.value) {
        const aTier = getCandidateQualificationTier(a);
        const bTier = getCandidateQualificationTier(b);
        if (bTier !== aTier) return bTier - aTier;
        const aAggressiveness = getCandidateAggressivenessPenalty(a);
        const bAggressiveness = getCandidateAggressivenessPenalty(b);
        if (aAggressiveness !== bAggressiveness) return aAggressiveness - bAggressiveness;
        if (b.det_min !== a.det_min) return b.det_min - a.det_min;
        if (b.det_peak !== a.det_peak) return b.det_peak - a.det_peak;
        if (b.detection_rate !== a.detection_rate) return b.detection_rate - a.detection_rate;
        const aInstability = a.timeouts + a.errors;
        const bInstability = b.timeouts + b.errors;
        if (aInstability !== bInstability) return aInstability - bInstability;
        return (b.attempts || b.samples || 0) - (a.attempts || a.samples || 0);
      }
      if (b.detection_rate !== a.detection_rate) return b.detection_rate - a.detection_rate;
      const aPenalty = a.timeouts + a.errors;
      const bPenalty = b.timeouts + b.errors;
      if (aPenalty !== bPenalty) return aPenalty - bPenalty;
      return b.det_peak - a.det_peak;
    })
    .slice(0, 8),
);

const validationStatus = computed(() => {
  if (isRunning.value) return { label: 'Running', style: 'text-primary bg-primary/opacity-light border-primary/opacity-medium' };
  if (!showResults.value) return { label: 'Not started', style: 'text-content-secondary bg-background-mute/opacity-light border-stroke-subtle/20' };

  const knownSignal = rangeInfo.value?.known_signal_present ?? knownSignalPresent.value;
  if (!knownSignal) {
    return { label: 'Partially validated (quiet-channel)', style: 'text-content-secondary bg-background-mute/opacity-light border-stroke-subtle/20' };
  }

  if (totalDetections.value > 0 && totalErrors.value === 0) {
    return { label: 'Validated with known signal', style: 'text-accent-green bg-accent-green/opacity-light border-accent-green/opacity-medium' };
  }

  return { label: 'Known-signal run inconclusive', style: 'text-accent-red bg-accent-red/opacity-light border-accent-red/opacity-medium' };
});

const guidanceCardTitle = computed(() =>
  activityPromptContext.value === 'no-known-signal'
    ? 'No known compatible signal confirmed'
    : activityPromptContext.value === 'limited-data'
    ? 'Calibration data is limited'
    : 'No CAD detections were observed',
);

const guidanceCardBody = computed(() =>
  activityPromptContext.value === 'no-known-signal'
    ? 'Calibration completed without known-signal validation. Please send compatible traffic on the same freq/SF/BW/CR, then run a guided validation rerun.'
    : activityPromptContext.value === 'limited-data'
    ? 'Please generate more compatible LoRa traffic on the same freq/SF/BW/CR, then run a guided validation rerun to improve reading quality.'
    : 'Generate compatible LoRa activity from another device on the same freq/SF/BW/CR, then run a guided validation rerun.',
);

const topCandidate = computed(() => rankedCandidates.value[0] ?? null);
const summaryCandidate = computed(
  () => bestCalibrationResult.value || backendRecommendedResult.value || topCandidate.value,
);
const activeKnownSignalMode = computed(
  () => Boolean(rangeInfo.value?.known_signal_present ?? knownSignalPresent.value),
);

function getDefaultCadThresholdsForSf(sf: number) {
  const defaults: Record<number, { peak: number; min: number }> = {
    7: { peak: 22, min: 10 },
    8: { peak: 22, min: 10 },
    9: { peak: 24, min: 10 },
    10: { peak: 25, min: 10 },
    11: { peak: 26, min: 10 },
    12: { peak: 30, min: 10 },
  };
  return defaults[sf] ?? defaults[8];
}

function isCandidatePenalized(candidate?: CalibrationResult | null) {
  if (!candidate || !activeKnownSignalMode.value) return false;
  const sf = Number(rangeInfo.value?.spreading_factor ?? 8);
  const defaults = getDefaultCadThresholdsForSf(sf);
  return candidate.det_peak < defaults.peak || candidate.det_min < defaults.min;
}

function getCandidateAggressivenessPenalty(candidate: CalibrationResult) {
  const sf = Number(rangeInfo.value?.spreading_factor ?? 8);
  const defaults = getDefaultCadThresholdsForSf(sf);
  return Math.max(0, defaults.peak - candidate.det_peak) + (2 * Math.max(0, defaults.min - candidate.det_min));
}

function getCandidateQualificationTier(candidate: CalibrationResult) {
  const instability = (candidate.timeouts || 0) + (candidate.errors || 0);
  const isStable = instability === 0;
  const meetsDetectionFloor = (candidate.detection_rate || 0) >= KNOWN_SIGNAL_REQUIRED_DETECTION_RATE;
  if (isStable && meetsDetectionFloor) return 2;
  if (isStable) return 1;
  return 0;
}

const diagnosticsSummary = computed(() => {
  const mode = (rangeInfo.value?.known_signal_present ?? knownSignalPresent.value)
    ? 'known-signal'
    : 'quiet';
  const sf = rangeInfo.value?.spreading_factor ?? 'n/a';
  const bw = rangeInfo.value?.bandwidth
    ? `${(rangeInfo.value.bandwidth / 1000).toFixed(1)}kHz`
    : 'n/a';
  const freq = rangeInfo.value?.frequency
    ? `${(rangeInfo.value.frequency / 1000000).toFixed(3)}MHz`
    : 'n/a';
  const best =
    summaryCandidate.value
      ? `recommended P${summaryCandidate.value.det_peak}/M${summaryCandidate.value.det_min} ${summaryCandidate.value.detection_rate.toFixed(1)}%`
      : 'recommended n/a';
  return `mode ${mode} • SF${sf} • BW ${bw} • Freq ${freq} • attempts ${totalAttempts.value} • det ${totalDetections.value} • timeout ${totalTimeouts.value} • err ${totalErrors.value} • ${best}`;
});

const manualDetectionRate = computed(() =>
  manualAttempts.value > 0 ? (manualDetections.value / manualAttempts.value) * 100 : 0,
);

const manualWindowDetectionRate = computed(() => {
  const window = manualRecentOutcomes.value;
  if (window.length === 0) return 0;
  const detections = window.filter(Boolean).length;
  return (detections / window.length) * 100;
});
const manualProgressFillStyle = computed(() => ({
  width: `${Math.max(0, Math.min(100, manualWindowDetectionRate.value))}%`,
}));

const manualQuality = computed(() => {
  const rate = manualWindowDetectionRate.value;
  if (rate < 15) return { label: 'Poor', style: 'text-accent-red border-accent-red/opacity-medium bg-accent-red/opacity-light' };
  if (rate < 40) return { label: 'Fair', style: 'text-orange-400 border-orange-400/40 bg-orange-400/10' };
  if (rate < 70) return { label: 'Good', style: 'text-primary border-primary/opacity-medium bg-primary/opacity-light' };
  return { label: 'Strong', style: 'text-accent-green border-accent-green/opacity-medium bg-accent-green/opacity-light' };
});

const recommendedActions = computed(() => {
  const actions: string[] = [];
  const knownSignal = rangeInfo.value?.known_signal_present ?? knownSignalPresent.value;

  if (!showResults.value) {
    return actions;
  }

  if (!knownSignal) {
    actions.push('This run tuned quiet-channel stability only.');
    actions.push('For real CAD validation, re-run while sending traffic on the same freq/SF/BW/CR.');
    return actions;
  }

  if (totalDetections.value <= 0) {
    actions.push('No CAD detections observed during known-signal test.');
    actions.push('Verify transmitter matches exact freq/SF/BW/CR and increase activity rate.');
  } else {
    actions.push('Known-signal detections observed. Repeat once more to confirm consistency.');
    actions.push('If stable, save settings and monitor timeout/error counters in normal operation.');
  }

  return actions;
});

const activityPromptTitle = computed(() =>
  activityPromptContext.value === 'no-detection'
    ? 'Improve calibration accuracy with more detections'
    : activityPromptContext.value === 'no-known-signal'
      ? 'No known signal during calibration'
    : activityPromptContext.value === 'limited-data'
      ? 'Limited calibration data detected'
    : 'Create channel activity now',
);

const activityPromptBody = computed(() =>
  activityPromptContext.value === 'no-detection'
    ? 'This run needs more CAD detections for stronger accuracy. Use another compatible device to transmit on the same freq/SF/BW/CR, then continue with a known-signal validation rerun.'
    : activityPromptContext.value === 'no-known-signal'
      ? 'Calibration completed without known-signal confirmation. Please try sending a compatible signal on the same freq/SF/BW/CR to improve readings, then rerun validation.'
    : activityPromptContext.value === 'limited-data'
      ? 'Calibration completed but data is limited. Please try sending a compatible signal on the same freq/SF/BW/CR to improve readings, then rerun validation.'
    : 'Known-signal validation works best with active compatible LoRa traffic on this exact channel (freq/SF/BW/CR). Start traffic now, then continue calibration.',
);

const activityPromptConfirmLabel = computed(() =>
  activityPromptContext.value === 'no-detection' ||
    activityPromptContext.value === 'limited-data' ||
    activityPromptContext.value === 'no-known-signal'
    ? 'Signal active — Start validation rerun'
    : 'Activity started — Begin calibration',
);

const CAD_INFO_COOKIE_NAME = 'cad_calibration_info_dismissed';

function getCookie(name: string): string | null {
  const key = `${name}=`;
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookiePart of cookies) {
    const cookie = cookiePart.trim();
    if (cookie.startsWith(key)) {
      return decodeURIComponent(cookie.substring(key.length));
    }
  }
  return null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function closeCadInfoModal() {
  if (dontShowCadInfoAgain.value) {
    setCookie(CAD_INFO_COOKIE_NAME, '1', 60 * 60 * 24 * 365);
  }
  showCadInfoModal.value = false;
  showCadInfoDetails.value = false;
}

function pushLog(level: LogEvent['level'], text: string) {
  processLog.value.unshift({ level, text, ts: Date.now() });
  if (processLog.value.length > 80) {
    processLog.value.length = 80;
  }
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function openManualCadModal() {
  const source = bestCalibrationResult.value || topCandidate.value;
  manualDetPeak.value = clampInt(source?.det_peak ?? 22, 0, 255);
  manualDetMin.value = clampInt(source?.det_min ?? 10, 0, 255);
  manualCadSymbolNum.value = 2;
  manualCadTimeoutMs.value = 500;
  manualIntervalMs.value = 250;
  manualAttempts.value = 0;
  manualDetections.value = 0;
  manualTimeouts.value = 0;
  manualErrors.value = 0;
  manualRecentOutcomes.value = [];
  showManualCadModal.value = true;
}

function resetManualCadInputs() {
  const source = bestCalibrationResult.value || topCandidate.value;
  manualDetPeak.value = clampInt(source?.det_peak ?? 22, 0, 255);
  manualDetMin.value = clampInt(source?.det_min ?? 10, 0, 255);
  manualCadSymbolNum.value = 2;
  manualCadTimeoutMs.value = 500;
  manualIntervalMs.value = 250;
}

function stopManualCadCheck() {
  manualCheckRunning.value = false;
  if (manualCheckTimer) {
    clearTimeout(manualCheckTimer);
    manualCheckTimer = null;
  }
}

async function runManualCadCheckIteration() {
  if (!manualCheckRunning.value || manualCheckBusy.value) return;
  manualCheckBusy.value = true;
  try {
    const result = await ApiService.post<{
      attempts: number;
      detections: number;
      non_detections: number;
      timeouts: number;
      errors: number;
      detection_rate: number;
      detected: boolean;
    }>('/cad-manual-check', {
      det_peak: clampInt(manualDetPeak.value, 0, 255),
      det_min: clampInt(manualDetMin.value, 0, 255),
      cad_symbol_num: manualCadSymbolNum.value,
      cad_timeout_ms: clampInt(manualCadTimeoutMs.value, 50, 5000),
      apply_live: manualApplyLive.value,
      samples: 1,
    });
    const payload = result.data;
    if (!result.success || !payload) {
      throw new Error(result.error || 'Manual CAD check failed');
    }

    manualAttempts.value += payload.attempts || 1;
    manualDetections.value += payload.detections || 0;
    manualTimeouts.value += payload.timeouts || 0;
    manualErrors.value += payload.errors || 0;
    manualRecentOutcomes.value.push(Boolean(payload.detected));
    if (manualRecentOutcomes.value.length > manualWindowSize) {
      manualRecentOutcomes.value.shift();
    }
  } catch (error) {
    manualErrors.value += 1;
  } finally {
    manualCheckBusy.value = false;
    if (manualCheckRunning.value) {
      manualCheckTimer = setTimeout(
        () => void runManualCadCheckIteration(),
        clampInt(manualIntervalMs.value, 100, 2000),
      );
    }
  }
}

function startManualCadCheck() {
  if (manualCheckRunning.value) return;
  manualAttempts.value = 0;
  manualDetections.value = 0;
  manualTimeouts.value = 0;
  manualErrors.value = 0;
  manualRecentOutcomes.value = [];
  manualCheckRunning.value = true;
  void runManualCadCheckIteration();
}

async function startCalibrationInternal(forceStart = false) {
  if (knownSignalPresent.value && !forceStart) {
    activityPromptContext.value = 'prestart';
    showActivityPrompt.value = true;
    return;
  }
  showActivityPrompt.value = false;
  showNoDetectionGuidance.value = false;
  const samples = 10;
  const delay = 50;

  try {
    const result = await ApiService.post('/cad-calibration-start', {
      samples,
      delay,
      known_signal_present: knownSignalPresent.value,
    });

    if (result.success) {
      isRunning.value = true;
      startTime.value = Date.now();
      systemStore.setCadCalibrationRunning(true);

      calibrationData.value = {};
      bestCalibrationResult.value = null;
      backendRecommendedResult.value = null;

      showRangeInfo.value = false;
      showResults.value = false;
      showBestResult.value = false;

      testsCompleted.value = 0;
      bestRate.value = 0;
      avgRate.value = 0;
      elapsedTime.value = 0;
      progressCurrent.value = 0;
      progressTotal.value = 0;
      totalAttempts.value = 0;
      totalDetections.value = 0;
      totalNonDetections.value = 0;
      totalTimeouts.value = 0;
      totalErrors.value = 0;
      quietModeInvalid.value = false;
      quietModeInvalidReason.value = '';
      recommendationMessage.value = '';
      processLog.value = [];

      pushLog('info', `Calibration started (${knownSignalPresent.value ? 'known-signal mode' : 'quiet-channel mode'}).`);

      elapsedTimer = setInterval(() => {
        if (startTime.value) {
          elapsedTime.value = Math.floor((Date.now() - startTime.value) / 1000);
        }
      }, 1000);

      connectEventSource();
    } else {
      throw new Error(result.error || 'Failed to start calibration');
    }
  } catch (error) {
    statusMessage.value = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    pushLog('error', statusMessage.value);
  }
}

function startCalibration() {
  void startCalibrationInternal(false);
}

function confirmActivityAndStart() {
  void startCalibrationInternal(true);
}

function startGuidedValidation() {
  knownSignalPresent.value = true;
  activityPromptContext.value = 'no-detection';
  showActivityPrompt.value = true;
}

async function stopCalibration() {
  try {
    const result = await ApiService.post('/cad-calibration-stop');
    if (result.success) {
      isRunning.value = false;
      systemStore.setCadCalibrationRunning(false);
      pushLog('info', 'Calibration stopped by user.');

      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    }
  } catch (error) {
    console.error('Failed to stop calibration:', error);
  }
}

function connectEventSource() {
  if (eventSource.value) {
    eventSource.value.close();
  }

  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  eventSource.value = new EventSource(`${API_SERVER_URL}/api/cad-calibration-stream${tokenParam}`);

  eventSource.value.onmessage = function (event) {
    try {
      const data = JSON.parse(event.data);
      handleCalibrationUpdate(data);
    } catch (error) {
      console.error('Failed to parse SSE data:', error);
    }
  };

  eventSource.value.onerror = function (event) {
    console.error('SSE connection error:', event);
    if (!isRunning.value) {
      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }
    }
  };
}

function handleCalibrationUpdate(data: CalibrationUpdate) {
  switch (data.type) {
    case 'status':
      statusMessage.value = data.message || 'Status update';
      pushLog('info', statusMessage.value);
      if (data.test_ranges) {
        rangeInfo.value = data.test_ranges;
        showRangeInfo.value = true;
        const bw = data.test_ranges.bandwidth
          ? `${(data.test_ranges.bandwidth / 1000).toFixed(1)}kHz`
          : 'n/a';
        const freq = data.test_ranges.frequency
          ? `${(data.test_ranges.frequency / 1000000).toFixed(3)}MHz`
          : 'n/a';
        pushLog(
          'info',
          `Config SF${data.test_ranges.spreading_factor} BW ${bw} Freq ${freq} sym ${data.test_ranges.cad_symbol_num ?? 2} mode ${data.test_ranges.known_signal_present ? 'known-signal' : 'quiet'} ranges P${data.test_ranges.peak_min}-${data.test_ranges.peak_max}/M${data.test_ranges.min_min}-${data.test_ranges.min_max}`,
        );
      }
      break;

    case 'progress':
      progressCurrent.value = data.current || 0;
      progressTotal.value = data.total || 0;
      testsCompleted.value = data.current || 0;
      if (progressCurrent.value > 0 && progressCurrent.value % 5 === 0) {
        pushLog('progress', `Progress ${progressCurrent.value}/${progressTotal.value}`);
      }
      break;

    case 'result':
      if (
        data.det_peak !== undefined &&
        data.det_min !== undefined &&
        data.detection_rate !== undefined &&
        data.detections !== undefined &&
        data.non_detections !== undefined &&
        data.timeouts !== undefined &&
        data.errors !== undefined &&
        data.attempts !== undefined &&
        data.samples !== undefined
      ) {
        const key = `${data.det_peak}_${data.det_min}`;
        calibrationData.value[key] = {
          det_peak: data.det_peak,
          det_min: data.det_min,
          detection_rate: data.detection_rate,
          detections: data.detections,
          non_detections: data.non_detections,
          timeouts: data.timeouts,
          errors: data.errors,
          attempts: data.attempts,
          samples: data.samples,
        };
        updateStats();
        if (
          progressCurrent.value === progressTotal.value ||
          progressCurrent.value % 6 === 0
        ) {
          pushLog(
            'progress',
            `Result P${data.det_peak}/M${data.det_min} det ${data.detections}/${data.attempts} (${data.detection_rate.toFixed(1)}%) to ${data.timeouts} err ${data.errors}`,
          );
        }
      }
      break;

    case 'complete':
    case 'completed':
      isRunning.value = false;
      statusMessage.value = data.message || 'Calibration completed';
      if (data.results?.qualification) {
        statusMessage.value = `${statusMessage.value} — ${data.results.qualification}`;
      }
      pushLog('info', statusMessage.value);

      if (data.results?.recommended) {
        backendRecommendedResult.value = data.results.recommended;
      } else if (data.results?.best) {
        backendRecommendedResult.value = data.results.best;
      }
      recommendationMessage.value = data.results?.recommendation_reason || '';
      quietModeInvalid.value = Boolean(data.results?.quiet_mode_invalid);
      quietModeInvalidReason.value = data.results?.quiet_mode_invalid_reason || '';
      if (quietModeInvalid.value && quietModeInvalidReason.value) {
        pushLog('info', quietModeInvalidReason.value);
      }

      systemStore.setCadCalibrationRunning(false);
      calculateAndShowResults();
      updateStats();
      if (summaryCandidate.value) {
        pushLog(
          'info',
          `Summary attempts ${totalAttempts.value} det ${totalDetections.value} non ${totalNonDetections.value} to ${totalTimeouts.value} err ${totalErrors.value} recommended P${summaryCandidate.value.det_peak}/M${summaryCandidate.value.det_min} ${summaryCandidate.value.detection_rate.toFixed(1)}%`,
        );
      } else {
        pushLog(
          'info',
          `Summary attempts ${totalAttempts.value} det ${totalDetections.value} non ${totalNonDetections.value} to ${totalTimeouts.value} err ${totalErrors.value}`,
        );
      }
      const backendDetections =
        data.results?.recommended?.detections ??
        data.results?.best?.detections ??
        0;
      const backendRate =
        data.results?.recommended?.detection_rate ??
        data.results?.best?.detection_rate ??
        0;
      const noDetectionsObserved =
        totalDetections.value <= 0 &&
        backendDetections <= 0 &&
        backendRate <= 0;
      const detectionsForAssessment = Math.max(totalDetections.value, backendDetections);
      const rateForAssessment = Math.max(
        backendRate,
        topCandidate.value?.detection_rate ?? 0,
      );
      const limitedDataObserved =
        !noDetectionsObserved &&
        (detectionsForAssessment < 5 || rateForAssessment < 20);
      const runKnownSignal = Boolean(
        data.results?.known_signal_effective ??
        data.results?.known_signal_present ??
        data.results?.signal_activity_observed ??
        rangeInfo.value?.known_signal_present ??
        knownSignalPresent.value,
      );
      const noKnownSignalValidation = !runKnownSignal;

      if (noDetectionsObserved || limitedDataObserved || noKnownSignalValidation) {
        knownSignalPresent.value = true;
        activityPromptContext.value = noDetectionsObserved
          ? 'no-detection'
          : noKnownSignalValidation
            ? 'no-known-signal'
            : 'limited-data';
        showNoDetectionGuidance.value = true;
        setTimeout(() => {
          showActivityPrompt.value = true;
        }, 100);
        pushLog(
          'info',
          noDetectionsObserved
            ? 'No CAD detections found. Prompting for real signal generation before validation rerun.'
            : noKnownSignalValidation
              ? 'No known-signal validation was confirmed. Prompting for guided validation rerun.'
            : 'Limited CAD data observed. Prompting for stronger signal activity before validation rerun.',
        );
      }

      if (eventSource.value) {
        eventSource.value.close();
        eventSource.value = null;
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      break;

    case 'error':
      statusMessage.value = `Error: ${data.message}`;
      pushLog('error', statusMessage.value);
      systemStore.setCadCalibrationRunning(false);
      stopCalibration();
      break;
  }
}

function updateStats() {
  const results = Object.values(calibrationData.value) as CalibrationResult[];
  if (results.length === 0) return;

  const rates = results.map((d) => d.detection_rate);
  bestRate.value = Math.max(...rates);
  avgRate.value = rates.reduce((a, b) => a + b, 0) / rates.length;
  totalAttempts.value = results.reduce((sum, r) => sum + (r.attempts || r.samples || 0), 0);
  totalDetections.value = results.reduce((sum, r) => sum + (r.detections || 0), 0);
  totalNonDetections.value = results.reduce((sum, r) => sum + (r.non_detections || 0), 0);
  totalTimeouts.value = results.reduce((sum, r) => sum + (r.timeouts || 0), 0);
  totalErrors.value = results.reduce((sum, r) => sum + (r.errors || 0), 0);
}

function calculateAndShowResults() {
  showResults.value = true;

  if (backendRecommendedResult.value) {
    bestCalibrationResult.value = backendRecommendedResult.value;
    showBestResult.value = true;
    return;
  }

  let bestResult = null;
  let bestRateValue = 0;

  for (const result of Object.values(calibrationData.value)) {
    if (result.detection_rate > bestRateValue) {
      bestRateValue = result.detection_rate;
      bestResult = result;
    }
  }

  bestCalibrationResult.value = bestResult;
  showBestResult.value = !!(bestResult && bestRateValue >= 0);
}

const showRestartModal = ref(false);

async function saveSettings() {
  if (!bestCalibrationResult.value) {
    statusMessage.value = 'Error: No calibration results to save';
    pushLog('error', statusMessage.value);
    return;
  }
  if (quietModeInvalid.value) {
    statusMessage.value = `Error: ${quietModeInvalidReason.value || 'Quiet baseline run is invalid due to channel activity. Re-run quiet mode in an idle channel before saving.'}`;
    pushLog('error', statusMessage.value);
    return;
  }

  try {
    const result = await ApiService.post('/save_cad_settings', {
      peak: bestCalibrationResult.value.det_peak,
      min_val: bestCalibrationResult.value.det_min,
      detection_rate: bestCalibrationResult.value.detection_rate,
    });

    if (result.success) {
      showRestartModal.value = true;
    } else {
      throw new Error(result.error || 'Failed to save settings');
    }
  } catch (error) {
    statusMessage.value = `Error: Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`;
    pushLog('error', statusMessage.value);
  }
}

onUnmounted(() => {
  stopManualCadCheck();
  if (eventSource.value) {
    eventSource.value.close();
  }
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
  }
  systemStore.setCadCalibrationRunning(false);
});

onMounted(() => {
  showCadInfoModal.value = getCookie(CAD_INFO_COOKIE_NAME) !== '1';
  showCadInfoDetails.value = false;
});
</script>

<template>
  <div class="h-[calc(100vh-5rem)] overflow-hidden p-4 flex flex-col gap-4">
    <div class="shrink-0">
      <h1 class="text-2xl font-bold text-content-primary">
        CAD Calibration Tool
      </h1>
      <p class="text-content-secondary dark:text-content-muted mt-2">
        Default-anchored calibration with real-time process feedback
      </p>
    </div>

    <div
      v-if="showNoDetectionGuidance && !isRunning"
      class="glass-card shrink-0 rounded-[15px] p-4 border border-accent-red/opacity-medium bg-accent-red/opacity-light space-y-3"
    >
      <h2 class="text-base font-semibold text-accent-red">{{ guidanceCardTitle }}</h2>
      <p class="text-sm text-content-secondary dark:text-content-muted">
        {{ guidanceCardBody }}
      </p>
      <div class="flex gap-3">
        <button class="btn-primary" @click="startGuidedValidation">
          Start guided validation now
        </button>
        <button
          class="px-4 py-2 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light"
          @click="showNoDetectionGuidance = false"
        >
          Dismiss
        </button>
      </div>
    </div>

    <div class="glass-card shrink-0 rounded-[15px] p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="inline-flex rounded-lg border border-stroke-subtle/30 overflow-hidden">
          <button
            class="px-3 py-1.5 text-xs font-medium transition-colors"
            :class="knownSignalPresent
              ? 'text-content-secondary bg-background-mute/opacity-light'
              : 'text-primary bg-primary/opacity-light'"
            :disabled="isRunning"
            @click="knownSignalPresent = false"
          >
            Quiet baseline
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium transition-colors border-l border-stroke-subtle/30"
            :class="knownSignalPresent
              ? 'text-primary bg-primary/opacity-light'
              : 'text-content-secondary bg-background-mute/opacity-light'"
            :disabled="isRunning"
            @click="knownSignalPresent = true"
          >
            Known-signal validation
          </button>
        </div>

        <span class="px-3 py-1 rounded-full border text-xs font-medium" :class="validationStatus.style">
          {{ validationStatus.label }}
        </span>
      </div>
      <div class="text-xs text-content-muted">
        Current mode:
        <strong>{{ knownSignalPresent ? 'Known-signal validation' : 'Quiet baseline' }}</strong>.
        Known-signal mode tests Semtech defaults first, then escalates only if required.
      </div>

      <div class="flex gap-4">
        <button
          @click="startCalibration"
          :disabled="isRunning"
          class="flex items-center gap-3 px-6 py-3 bg-accent-green/opacity-light hover:bg-accent-green/opacity-medium disabled:bg-background-mute/opacity-light text-accent-green disabled:text-content-muted rounded-lg border border-accent-green/opacity-medium disabled:border-stroke-subtle/20 transition-colors disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <div class="text-left">
            <div class="font-medium">Start Calibration</div>
            <div class="text-xs opacity-80">Run CAD test sequence</div>
          </div>
        </button>
        <button
          @click="openManualCadModal"
          :disabled="isRunning"
          class="flex items-center gap-3 px-6 py-3 bg-primary/opacity-light hover:bg-primary/opacity-medium disabled:bg-background-mute/opacity-light text-primary disabled:text-content-muted rounded-lg border border-primary/opacity-medium disabled:border-stroke-subtle/20 transition-colors disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M3 13h4l3 8 4-16 3 8h4"></path>
          </svg>
          <div class="text-left">
            <div class="font-medium">Manual CAD Check</div>
            <div class="text-xs opacity-80">Quick live detection gauge</div>
          </div>
        </button>
        <button
          @click="stopCalibration"
          :disabled="!isRunning"
          class="flex items-center gap-3 px-6 py-3 bg-accent-red/opacity-light hover:bg-accent-red/opacity-medium disabled:bg-background-mute/opacity-light text-accent-red disabled:text-content-muted rounded-lg border border-accent-red/opacity-medium disabled:border-stroke-subtle/20 transition-colors disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12"></rect>
          </svg>
          <div class="text-left">
            <div class="font-medium">Stop</div>
            <div class="text-xs opacity-80">Halt calibration</div>
          </div>
        </button>
      </div>
    </div>

    <div class="glass-card shrink-0 rounded-[15px] p-4 space-y-3">
      <div class="text-content-primary">{{ statusMessage }}</div>

      <div class="space-y-2">
        <div class="w-full bg-white/opacity-light rounded-full h-2">
          <div
            class="bg-gradient-to-r from-primary to-accent-green h-2 rounded-full transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>
        <div class="text-content-secondary dark:text-content-muted text-sm">
          {{ progressCurrent }} / {{ progressTotal }} parameter sets completed
        </div>
      </div>

      <div
        class="px-4 py-3 bg-primary/opacity-light border border-primary/opacity-medium rounded-lg text-sm text-content-primary"
        v-if="showRangeInfo && rangeInfo"
      >
        <strong>Runtime:</strong>
        SF{{ rangeInfo.spreading_factor }} |
        BW: {{ rangeInfo.bandwidth ? `${(rangeInfo.bandwidth / 1000).toFixed(1)}kHz` : 'n/a' }} |
        Freq: {{ rangeInfo.frequency ? `${(rangeInfo.frequency / 1000000).toFixed(3)}MHz` : 'n/a' }} |
        CAD symbols: {{ rangeInfo.cad_symbol_num ?? 2 }} |
        Peak {{ rangeInfo.peak_min }}–{{ rangeInfo.peak_max }} |
        Min {{ rangeInfo.min_min }}–{{ rangeInfo.min_max }}
      </div>
    </div>

    <div class="grid shrink-0 grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <div class="glass-card rounded-[15px] p-3 text-center">
        <div class="text-2xl font-bold text-primary">{{ testsCompleted }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Tested Sets</div>
      </div>
      <div class="glass-card rounded-[15px] p-3 text-center">
        <div class="text-2xl font-bold text-primary">{{ elapsedTime }}s</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Elapsed</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ totalAttempts }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Attempts</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-accent-green">{{ totalDetections }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">CAD_DETECTED</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ totalNonDetections }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Non-detect</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ totalTimeouts }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Timeouts</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-accent-red">{{ totalErrors }}</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Errors</div>
      </div>
      <div class="glass-card rounded-[15px] p-4 text-center">
        <div class="text-2xl font-bold text-primary">{{ bestRate.toFixed(1) }}%</div>
        <div class="text-content-secondary dark:text-content-muted text-sm">Best Rate</div>
      </div>
    </div>

    <div class="min-h-0 flex-1 grid lg:grid-cols-2 gap-4 overflow-hidden">
      <div class="glass-card rounded-[15px] p-4 space-y-3 overflow-auto">
        <h2 class="text-lg font-semibold text-content-primary">Recommendation</h2>
        <div v-if="showBestResult && bestCalibrationResult" class="text-sm text-content-primary">
          Peak <strong>{{ bestCalibrationResult.det_peak }}</strong>,
          Min <strong>{{ bestCalibrationResult.det_min }}</strong>,
          Detection rate <strong>{{ bestCalibrationResult.detection_rate.toFixed(1) }}%</strong>,
          Samples <strong>{{ bestCalibrationResult.attempts || bestCalibrationResult.samples }}</strong>
          <span
            v-if="isCandidatePenalized(bestCalibrationResult)"
            class="ml-2 inline-flex items-center rounded-full border border-orange-400/40 bg-orange-400/10 px-2 py-0.5 text-xs text-orange-400"
          >
            Penalized: over-sensitive
          </span>
        </div>
        <div v-else class="text-sm text-content-muted">
          No recommendation yet. Run calibration to generate candidates.
        </div>
        <div v-if="recommendationMessage" class="text-sm text-content-secondary dark:text-content-muted">
          {{ recommendationMessage }}
        </div>
        <ul class="space-y-2 text-sm text-content-secondary dark:text-content-muted list-disc list-inside">
          <li v-for="action in recommendedActions" :key="action">{{ action }}</li>
        </ul>
        <button
          v-if="showBestResult && bestCalibrationResult"
          @click="saveSettings"
          :disabled="quietModeInvalid"
          class="btn-primary flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          Save Settings
        </button>
        <div
          v-if="quietModeInvalid"
          class="text-xs text-accent-red"
        >
          {{ quietModeInvalidReason || 'Quiet baseline run is invalid due to observed channel activity. Re-run quiet mode in an idle channel before saving.' }}
        </div>
      </div>

      <div class="glass-card rounded-[15px] p-4 space-y-3 overflow-auto">
        <h2 class="text-lg font-semibold text-content-primary">Top candidate settings</h2>
        <div v-if="rankedCandidates.length === 0" class="text-sm text-content-muted">
          Candidates appear here as tests complete.
        </div>
        <div v-else class="max-h-64 overflow-auto">
          <table class="w-full text-sm">
            <thead class="text-content-secondary dark:text-content-muted">
              <tr class="border-b border-stroke-subtle/30">
                <th class="text-left py-2">Peak</th>
                <th class="text-left py-2">Min</th>
                <th class="text-left py-2">Rate</th>
                <th class="text-left py-2">Samples</th>
                <th class="text-left py-2">Detections</th>
                <th class="text-left py-2">Timeouts</th>
                <th class="text-left py-2">Errors</th>
                <th class="text-left py-2">Flags</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="candidate in rankedCandidates"
                :key="`${candidate.det_peak}-${candidate.det_min}`"
                class="border-b border-stroke-subtle/20 text-content-primary"
              >
                <td class="py-2">{{ candidate.det_peak }}</td>
                <td class="py-2">{{ candidate.det_min }}</td>
                <td class="py-2">{{ candidate.detection_rate.toFixed(1) }}%</td>
                <td class="py-2">{{ candidate.attempts || candidate.samples }}</td>
                <td class="py-2">{{ candidate.detections }}/{{ candidate.attempts }}</td>
                <td class="py-2">{{ candidate.timeouts }}</td>
                <td class="py-2">{{ candidate.errors }}</td>
                <td class="py-2">
                  <span
                    v-if="isCandidatePenalized(candidate)"
                    class="inline-flex items-center rounded-full border border-orange-400/40 bg-orange-400/10 px-2 py-0.5 text-xs text-orange-400"
                  >
                    Over-sensitive penalty
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="glass-card shrink-0 rounded-[15px] p-4 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-content-primary">Calibration process log</h2>
        <button
          class="px-3 py-1.5 rounded-lg border border-stroke-subtle/30 text-content-secondary text-sm hover:bg-background-mute/opacity-light"
          @click="toggleProcessLog"
        >
          {{ showProcessLogExpanded ? 'Collapse' : 'Expand' }}
        </button>
      </div>

      <div class="text-xs text-content-secondary dark:text-content-muted break-words">
        {{ diagnosticsSummary }}
      </div>

      <div
        class="flex flex-wrap gap-2 text-xs text-content-secondary dark:text-content-muted"
      >
        <span class="px-2 py-1 rounded border border-stroke-subtle/30">entries {{ processLog.length }}</span>
        <span class="px-2 py-1 rounded border border-stroke-subtle/30">progress {{ progressCurrent }}/{{ progressTotal }}</span>
        <span class="px-2 py-1 rounded border border-stroke-subtle/30">best {{ bestRate.toFixed(1) }}%</span>
      </div>

      <div v-if="showProcessLogExpanded">
        <div v-if="processLog.length === 0" class="text-sm text-content-muted">
          Process events will appear here while calibration runs.
        </div>
        <div v-else class="max-h-64 overflow-auto space-y-2">
          <div
            v-for="entry in processLog"
            :key="`${entry.ts}-${entry.text}`"
            class="px-3 py-2 rounded-lg border text-sm"
            :class="{
              'border-accent-red/opacity-medium text-accent-red bg-accent-red/opacity-light': entry.level === 'error',
              'border-primary/opacity-medium text-primary bg-primary/opacity-light': entry.level === 'progress',
              'border-stroke-subtle/30 text-content-secondary bg-background-mute/opacity-light': entry.level === 'info'
            }"
          >
            {{ new Date(entry.ts).toLocaleTimeString() }} — {{ entry.text }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="showManualCadModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div class="glass-card w-full max-w-2xl rounded-[15px] p-6 space-y-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary">Manual CAD check</h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Fine-tune CAD settings and watch live detection quality before running full calibration.
          </p>
        </div>
        <button
          class="px-3 py-1.5 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light"
          @click="showManualCadModal = false; stopManualCadCheck()"
        >
          Close
        </button>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary dark:text-content-muted">
        <span>Tip: Start with the recommended Peak/Min, then adjust slowly while traffic is active.</span>
        <button
          class="px-2.5 py-1 rounded-md border border-stroke-subtle/30 hover:bg-background-mute/opacity-light"
          @click="resetManualCadInputs"
        >
          Reset inputs
        </button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <label class="space-y-1">
          <span class="text-content-secondary dark:text-content-muted">Peak threshold</span>
          <input
            v-model.number="manualDetPeak"
            type="number"
            min="0"
            max="255"
            class="w-full rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light px-3 py-2 text-content-primary"
          />
        </label>
        <label class="space-y-1">
          <span class="text-content-secondary dark:text-content-muted">Min threshold</span>
          <input
            v-model.number="manualDetMin"
            type="number"
            min="0"
            max="255"
            class="w-full rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light px-3 py-2 text-content-primary"
          />
        </label>
        <label class="space-y-1">
          <span class="text-content-secondary dark:text-content-muted">CAD symbols</span>
          <select
            v-model.number="manualCadSymbolNum"
            class="w-full rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light px-3 py-2 text-content-primary"
          >
            <option :value="1">1</option>
            <option :value="2">2</option>
            <option :value="4">4</option>
            <option :value="8">8</option>
            <option :value="16">16</option>
          </select>
        </label>
        <label class="space-y-1">
          <span class="text-content-secondary dark:text-content-muted">Timeout (ms)</span>
          <input
            v-model.number="manualCadTimeoutMs"
            type="number"
            min="50"
            max="5000"
            class="w-full rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light px-3 py-2 text-content-primary"
          />
        </label>
        <label class="space-y-1">
          <span class="text-content-secondary dark:text-content-muted">Interval (ms)</span>
          <input
            v-model.number="manualIntervalMs"
            type="number"
            min="100"
            max="2000"
            class="w-full rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light px-3 py-2 text-content-primary"
          />
        </label>
      </div>

      <label class="flex items-center gap-2 text-sm text-content-secondary dark:text-content-muted">
        <input
          v-model="manualApplyLive"
          type="checkbox"
          class="rounded border-stroke-subtle"
        />
        Live apply thresholds to radio while checking (real-time effect)
      </label>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm text-content-primary font-medium">
            Instant window quality (last {{ manualRecentOutcomes.length || 0 }})
          </div>
          <span class="px-3 py-1 rounded-full border text-xs font-medium" :class="manualQuality.style">
            {{ manualQuality.label }}
          </span>
        </div>
        <div class="h-4 w-full rounded-full overflow-hidden border border-stroke-subtle/30 bg-background-mute/opacity-light relative">
          <div class="absolute inset-0 grid grid-cols-4 opacity-35">
            <div class="bg-accent-red/40"></div>
            <div class="bg-orange-400/30"></div>
            <div class="bg-primary/30"></div>
            <div class="bg-accent-green/30"></div>
          </div>
          <div
            class="h-full bg-gradient-to-r from-accent-red via-primary to-accent-green transition-all duration-300 relative z-10"
            :style="manualProgressFillStyle"
          ></div>
        </div>
        <div class="flex justify-between text-[11px] text-content-muted">
          <span>0%</span>
          <span>15%</span>
          <span>40%</span>
          <span>70%</span>
          <span>100%</span>
        </div>
      </div>

      <div class="space-y-2 text-sm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-content-secondary dark:text-content-muted">
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">
            Instant window {{ manualWindowDetectionRate.toFixed(1) }}%
          </span>
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">
            Session average {{ manualDetectionRate.toFixed(1) }}%
          </span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-content-secondary dark:text-content-muted">
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">Attempts {{ manualAttempts }}</span>
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">Detections {{ manualDetections }}</span>
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">Timeouts {{ manualTimeouts }}</span>
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">Errors {{ manualErrors }}</span>
          <span class="px-2 py-1 rounded border border-stroke-subtle/30">Window size {{ manualWindowSize }}</span>
        </div>
        <div class="flex gap-3">
          <button class="btn-primary" :disabled="manualCheckRunning" @click="startManualCadCheck">
            Start
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light disabled:opacity-50"
            :disabled="!manualCheckRunning"
            @click="stopManualCadCheck"
          >
            Stop
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light"
            @click="manualAttempts = 0; manualDetections = 0; manualTimeouts = 0; manualErrors = 0; manualRecentOutcomes = []"
          >
            Clear counters
          </button>
        </div>
        <div class="text-xs text-content-muted">
          Aim for higher and stable detection quality with low timeouts/errors before saving thresholds.
        </div>
      </div>
    </div>
  </div>

  <div
    v-if="showCadInfoModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div class="glass-card w-full max-w-2xl rounded-[15px] p-6 space-y-4">
      <h3 class="text-lg font-semibold text-content-primary">CAD Calibration overview (Experimental)</h3>
      <p class="text-sm text-content-secondary dark:text-content-muted">
        This tool is <strong>experimental</strong>. It helps tune CAD thresholds and symbol settings using live channel observations, but results can vary with traffic and RF conditions.
      </p>
      <div class="grid md:grid-cols-2 gap-3 text-sm">
        <div class="rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light p-3 space-y-1">
          <div class="font-medium text-content-primary">Quiet baseline mode</div>
          <p class="text-content-secondary dark:text-content-muted">
            Use when no intentional signal is present. Goal: minimize false CAD detections and instability (timeouts/errors).
          </p>
        </div>
        <div class="rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light p-3 space-y-1">
          <div class="font-medium text-content-primary">Known-signal validation mode</div>
          <p class="text-content-secondary dark:text-content-muted">
            Use while generating compatible traffic on the same freq/SF/BW/CR. Goal: confirm reliable CAD detections with stable behavior.
          </p>
        </div>
      </div>
      <div class="text-sm text-content-secondary dark:text-content-muted">
        Recommended flow: run Quiet baseline first, then run Known-signal validation (default-first escalation) before saving settings.
      </div>
      <div class="flex justify-start">
        <button
          class="px-4 py-2 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light"
          @click="showCadInfoDetails = !showCadInfoDetails"
        >
          {{ showCadInfoDetails ? 'Hide detailed explanation' : 'Expand: how it works' }}
        </button>
      </div>
      <div
        v-if="showCadInfoDetails"
        class="rounded-lg border border-stroke-subtle/30 bg-background-mute/opacity-light p-4 space-y-2 text-sm text-content-secondary dark:text-content-muted"
      >
        <p>
          Known-signal calibration starts at Semtech defaults and checks if they already meet a strict stability/performance target.
        </p>
        <p>
          If defaults fail, the tool performs bounded one-step escalation (slightly more sensitive each step) and stops at the first stable candidate that qualifies.
        </p>
        <p>
          Quiet baseline still focuses on minimizing false detections and instability. Manual CAD check lets you tune values live before saving.
        </p>
      </div>
      <label class="flex items-center gap-2 text-sm text-content-secondary dark:text-content-muted">
        <input
          v-model="dontShowCadInfoAgain"
          type="checkbox"
          class="rounded border-stroke-subtle"
        />
        Don’t show again
      </label>
      <div class="flex justify-end">
        <button
          class="btn-primary"
          @click="closeCadInfoModal"
        >
          Continue
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="showActivityPrompt"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div class="glass-card w-full max-w-lg rounded-[15px] p-6 space-y-4">
      <h3 class="text-lg font-semibold text-content-primary">{{ activityPromptTitle }}</h3>
      <p class="text-sm text-content-secondary dark:text-content-muted">
        {{ activityPromptBody }}
      </p>
      <div class="flex justify-end gap-3">
        <button
          class="px-4 py-2 rounded-lg border border-stroke-subtle/30 text-content-secondary hover:bg-background-mute/opacity-light"
          @click="showActivityPrompt = false"
        >
          Cancel
        </button>
        <button
          class="btn-primary"
          @click="confirmActivityAndStart"
        >
          {{ activityPromptConfirmLabel }}
        </button>
      </div>
    </div>
  </div>

  <RestartModal
    v-model="showRestartModal"
    title="CAD Calibration Saved: Restart Required"
    message="In order for the CAD Calibration settings to take effect and the noise floor to return to normal, the service needs to be restarted."
  />
</template>

<style scoped>
.glass-card {
  background: var(--color-glass-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--color-glass-border);
  box-shadow: var(--color-glass-shadow);
}
</style>