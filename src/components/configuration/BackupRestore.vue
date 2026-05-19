<template>
  <div class="space-y-12">
    <!-- Page Heading -->
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary dark:text-content-primary mb-1 sm:mb-2">Backup &amp; Restore</h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">Export, import, and restore your repeater configuration</p>
      </div>
    </div>

    <!-- HTTP Security Warning -->
    <div
      v-if="isInsecure"
      class="rounded-lg border-2 border-red-500/50 dark:border-red-400/40 bg-red-100 dark:bg-red-500/10 p-4"
    >
      <div class="flex items-start gap-3">
        <svg
          class="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h4 class="text-sm font-semibold text-red-700 dark:text-red-400">
            Unencrypted Connection
          </h4>
          <p class="text-xs text-red-600 dark:text-red-400/80 mt-1">
            This page is served over <strong>HTTP</strong>, not HTTPS. Exported data (including
            identity keys) will be transmitted in <strong>plain text</strong>. Only use these
            features on a trusted local network.
          </p>
        </div>
      </div>
    </div>

    <!-- Export Settings (Redacted) -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Export Settings
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Download the current configuration as a JSON file. Passwords, JWT secrets, and identity
            keys are <strong>redacted</strong>. Safe to share or use as a template for other
            devices.
          </p>
        </div>
      </div>
      <button
        @click="exportConfig"
        :disabled="exporting"
        class="cfg-btn-primary"
      >
        <span v-if="exporting" class="flex items-center gap-2">
          <Spinner size="sm" color="current" class="inline-block" />
          Exporting…
        </span>
        <span v-else class="flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export Settings
        </span>
      </button>
      <p v-if="exportSuccess" class="text-xs text-green-600 dark:text-green-400 mt-2">
        {{ exportSuccess }}
      </p>
      <p v-if="exportError" class="text-xs text-red-500 dark:text-red-400 mt-2">
        {{ exportError }}
      </p>
    </div>

    <!-- Full Backup (with secrets) -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Full Backup
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Download a complete backup including
            <strong>all passwords, JWT secrets, and identity keys</strong>. Required for restoring
            to a new device or recovering from a failed SD card.
          </p>
        </div>
      </div>

      <div
        class="rounded-lg border border-red-500/30 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 p-3 mb-4"
      >
        <p class="text-xs text-red-700 dark:text-red-400">
          <strong>Contains sensitive data.</strong> The backup file will include plain-text
          passwords and private keys. Store it securely and never share it.
        </p>
      </div>

      <div v-if="!showFullBackupConfirm">
        <button
          @click="showFullBackupConfirm = true"
          class="px-4 py-2 bg-red-500/20 dark:bg-red-400/20 hover:bg-red-500/30 dark:hover:bg-red-400/30 text-red-900 dark:text-red-200 rounded-lg border border-red-500/50 dark:border-red-400/40 transition-colors text-sm"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Full Backup
          </span>
        </button>
      </div>

      <div
        v-if="showFullBackupConfirm"
        class="rounded-lg border-2 border-red-500/50 dark:border-red-400/40 bg-red-50 dark:bg-red-500/10 p-4"
      >
        <div class="flex items-start gap-3">
          <svg
            class="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-red-700 dark:text-red-400">
              Confirm Full Backup
            </h4>
            <p class="text-xs text-red-600 dark:text-red-400/80 mt-1">
              This will export <strong>all secrets in plain text</strong> including admin/guest
              passwords, JWT secret, and your repeater's private identity key{{
                isInsecure ? ' over an unencrypted HTTP connection' : ''
              }}.
            </p>
            <div class="flex gap-2 mt-3">
              <button
                @click="exportFullBackup"
                :disabled="fullBackupExporting"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                {{ fullBackupExporting ? 'Exporting…' : 'Yes, Export Full Backup' }}
              </button>
              <button
                @click="showFullBackupConfirm = false"
                :disabled="fullBackupExporting"
                class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="fullBackupSuccess" class="text-xs text-green-600 dark:text-green-400 mt-2">
        {{ fullBackupSuccess }}
      </p>
      <p v-if="fullBackupError" class="text-xs text-red-500 dark:text-red-400 mt-2">
        {{ fullBackupError }}
      </p>
    </div>

    <!-- Import Config -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Import Configuration
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Restore configuration from a previously exported JSON file. Importing a
            <strong>full backup</strong> will also restore passwords and identity keys. Importing a
            <strong>settings export</strong> will only update non-sensitive settings.
          </p>
        </div>
      </div>

      <!-- File picker -->
      <div class="space-y-3">
        <label
          class="flex items-center gap-3 cursor-pointer px-4 py-3 bg-background-mute dark:bg-background/30 rounded-lg border-2 border-dashed border-stroke-subtle dark:border-stroke/20 hover:border-cyan-500/50 dark:hover:border-primary/50 transition-colors"
        >
          <svg
            class="w-5 h-5 text-content-secondary dark:text-content-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          <span class="text-sm text-content-secondary dark:text-content-muted">
            {{ importFile ? importFile.name : 'Choose a config JSON file…' }}
          </span>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onFileSelected"
          />
        </label>

        <!-- Preview after file selected -->
        <div
          v-if="importPreview"
          class="bg-background-mute dark:bg-background/30 rounded-lg p-4 border border-stroke-subtle dark:border-stroke/10"
        >
          <h4 class="text-sm font-medium text-content-primary dark:text-content-primary mb-2">
            Import Preview
          </h4>
          <div
            v-if="importPreview.meta"
            class="text-xs text-content-secondary dark:text-content-muted space-y-1 mb-3"
          >
            <p>
              Exported: <span class="font-mono">{{ importPreview.meta.exported_at }}</span>
            </p>
            <p>
              Version: <span class="font-mono">{{ importPreview.meta.version }}</span>
            </p>
            <p
              v-if="
                importPreview.meta.includes_secrets === 'true' ||
                importPreview.meta.includes_secrets === true
              "
              class="text-amber-600 dark:text-amber-400 font-medium"
            >
              &#9888; Full backup — will restore passwords and identity keys
            </p>
            <p v-else class="text-content-muted">
              Settings only — existing secrets will not be changed
            </p>
          </div>
          <p class="text-xs text-content-secondary dark:text-content-muted">
            Sections: <span class="font-mono">{{ importPreviewSections }}</span>
          </p>
        </div>

        <!-- Confirmation -->
        <div v-if="importPreview && !showImportConfirm">
          <button
            @click="showImportConfirm = true"
            class="px-4 py-2 bg-amber-500/20 dark:bg-amber-400/20 hover:bg-amber-500/30 dark:hover:bg-amber-400/30 text-amber-900 dark:text-amber-200 rounded-lg border border-amber-500/50 dark:border-amber-400/40 transition-colors text-sm"
          >
            Review &amp; Import
          </button>
        </div>

        <!-- Confirm dialog -->
        <div
          v-if="showImportConfirm"
          class="rounded-lg border-2 border-amber-500/50 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-4"
        >
          <div class="flex items-start gap-3">
            <svg
              class="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div class="flex-1">
              <h4 class="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Confirm Import
              </h4>
              <p class="text-xs text-amber-700 dark:text-amber-300/80 mt-1">
                This will overwrite current settings for:
                <strong>{{ importPreviewSections }}</strong
                >.
                <template v-if="importIncludesSecrets">
                  This is a full backup —
                  <strong>passwords, JWT secrets, and identity keys will also be overwritten</strong
                  >.
                </template>
                <template v-else> Passwords and identity keys will not be changed. </template>
                Some changes (radio settings) require a service restart.
              </p>
              <div class="flex gap-2 mt-3">
                <button
                  @click="importConfig"
                  :disabled="importing"
                  class="px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
                >
                  {{ importing ? 'Importing…' : 'Yes, Import' }}
                </button>
                <button
                  @click="cancelImport"
                  :disabled="importing"
                  class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <p v-if="importSuccess" class="text-xs text-green-600 dark:text-green-400 mt-2">
          {{ importSuccess }}
        </p>
        <p v-if="importError" class="text-xs text-red-500 dark:text-red-400 mt-2">
          {{ importError }}
        </p>
      </div>
    </div>

    <!-- Export Identity Key -->
    <div class="cfg-section">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-lg font-semibold text-content-primary dark:text-content-primary mb-1">
            Export Identity Key
          </h3>
          <p class="text-sm text-content-secondary dark:text-content-muted">
            Download the repeater's private identity key for backup. This key determines the node's
            address and cryptographic identity on the mesh.
          </p>
        </div>
      </div>

      <!-- Danger warning -->
      <div
        class="rounded-lg border border-red-500/30 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 p-3 mb-4"
      >
        <p class="text-xs text-red-700 dark:text-red-400">
          <strong>Sensitive data.</strong> The identity key is the repeater's private key. Anyone
          with this key can impersonate your node. Store the exported file securely and never share
          it.
        </p>
      </div>

      <div v-if="!showIdentityConfirm">
        <button
          @click="showIdentityConfirm = true"
          class="px-4 py-2 bg-red-500/20 dark:bg-red-400/20 hover:bg-red-500/30 dark:hover:bg-red-400/30 text-red-900 dark:text-red-200 rounded-lg border border-red-500/50 dark:border-red-400/40 transition-colors text-sm"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
            Export Identity Key
          </span>
        </button>
      </div>

      <!-- Identity confirm -->
      <div
        v-if="showIdentityConfirm && !identityData"
        class="rounded-lg border-2 border-red-500/50 dark:border-red-400/40 bg-red-50 dark:bg-red-500/10 p-4"
      >
        <div class="flex items-start gap-3">
          <svg
            class="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-red-700 dark:text-red-400">Are you sure?</h4>
            <p class="text-xs text-red-600 dark:text-red-400/80 mt-1">
              This will transmit your private key
              {{ isInsecure ? 'over an unencrypted HTTP connection. ' : '' }}
              and download it as a file.
            </p>
            <div class="flex gap-2 mt-3">
              <button
                @click="exportIdentity"
                :disabled="identityExporting"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
              >
                {{ identityExporting ? 'Exporting…' : 'Yes, Export Key' }}
              </button>
              <button
                @click="showIdentityConfirm = false"
                :disabled="identityExporting"
                class="px-4 py-2 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10 text-content-primary dark:text-content-primary rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Identity result (show details before download) -->
      <div
        v-if="identityData"
        class="bg-background-mute dark:bg-background/30 rounded-lg p-4 border border-stroke-subtle dark:border-stroke/10 space-y-2"
      >
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-content-primary dark:text-content-primary">
            Key Exported
          </h4>
          <button
            @click="
              identityData = null;
              showIdentityConfirm = false;
            "
            class="text-xs text-content-muted hover:text-content-secondary transition-colors"
          >
            Dismiss
          </button>
        </div>
        <div class="text-xs text-content-secondary dark:text-content-muted space-y-1">
          <p>
            Key length: <span class="font-mono">{{ identityData.key_length_bytes }} bytes</span>
          </p>
          <p v-if="identityData.node_address">
            Node address: <span class="font-mono">{{ identityData.node_address }}</span>
          </p>
          <p v-if="identityData.public_key_hex">
            Public key:
            <span class="font-mono text-[10px] break-all">{{ identityData.public_key_hex }}</span>
          </p>
        </div>
        <p class="text-xs text-green-600 dark:text-green-400">File downloaded successfully.</p>
      </div>

      <p v-if="identityError" class="text-xs text-red-500 dark:text-red-400 mt-2">
        {{ identityError }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ApiService from '@/utils/api';
import Spinner from '@/components/ui/Spinner.vue';

const isInsecure = computed(() => window.location.protocol === 'http:');

// --- Export Config (Settings Only) ---
const exporting = ref(false);
const exportSuccess = ref('');
const exportError = ref('');

async function exportConfig() {
  exporting.value = true;
  exportSuccess.value = '';
  exportError.value = '';
  try {
    const res = await ApiService.exportConfig(false);
    if (!res.success || !res.data) {
      exportError.value = res.error || 'Export failed';
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = (res.data.meta?.exported_at || new Date().toISOString()).replace(/[:.]/g, '-');
    a.download = `pymc-repeater-settings-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    exportSuccess.value = 'Settings exported successfully (secrets redacted).';
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : 'Export failed';
  } finally {
    exporting.value = false;
  }
}

// --- Full Backup (with secrets) ---
const showFullBackupConfirm = ref(false);
const fullBackupExporting = ref(false);
const fullBackupSuccess = ref('');
const fullBackupError = ref('');

async function exportFullBackup() {
  fullBackupExporting.value = true;
  fullBackupSuccess.value = '';
  fullBackupError.value = '';
  try {
    const res = await ApiService.exportConfig(true);
    if (!res.success || !res.data) {
      fullBackupError.value = res.error || 'Export failed';
      return;
    }
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = (res.data.meta?.exported_at || new Date().toISOString()).replace(/[:.]/g, '-');
    a.download = `pymc-repeater-full-backup-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    fullBackupSuccess.value = 'Full backup exported (includes all secrets).';
    showFullBackupConfirm.value = false;
  } catch (err) {
    fullBackupError.value = err instanceof Error ? err.message : 'Export failed';
  } finally {
    fullBackupExporting.value = false;
  }
}

// --- Import Config ---
const importFile = ref<File | null>(null);
const importPreview = ref<{
  meta?: { exported_at?: string; version?: string; includes_secrets?: boolean | string };
  config: Record<string, unknown>;
} | null>(null);
const showImportConfirm = ref(false);
const importing = ref(false);
const importSuccess = ref('');
const importError = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

const importPreviewSections = computed(() => {
  if (!importPreview.value?.config) return '';
  return Object.keys(importPreview.value.config).join(', ');
});

const importIncludesSecrets = computed(() => {
  const v = importPreview.value?.meta?.includes_secrets;
  return v === true || v === 'true';
});

function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  importFile.value = file;
  importPreview.value = null;
  showImportConfirm.value = false;
  importSuccess.value = '';
  importError.value = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      // Support both raw config objects and export-wrapped format
      if (parsed.config && typeof parsed.config === 'object') {
        importPreview.value = { meta: parsed.meta, config: parsed.config };
      } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        importPreview.value = { config: parsed };
      } else {
        importError.value = 'Invalid file format — expected a JSON config object.';
      }
    } catch {
      importError.value = 'Invalid JSON file.';
    }
  };
  reader.readAsText(file);
}

function cancelImport() {
  showImportConfirm.value = false;
  importPreview.value = null;
  importFile.value = null;
  if (fileInputRef.value) fileInputRef.value.value = '';
}

async function importConfig() {
  if (!importPreview.value?.config) return;
  importing.value = true;
  importSuccess.value = '';
  importError.value = '';
  try {
    const res = await ApiService.importConfig(importPreview.value.config);
    if (res.success) {
      const data = res.data as {
        sections_updated?: string[];
        restart_required?: boolean;
        message?: string;
      };
      let msg = res.message || data?.message || 'Configuration imported.';
      if (data?.restart_required) {
        msg += ' A service restart is required for radio changes to take effect.';
      }
      importSuccess.value = msg;
      showImportConfirm.value = false;
      importPreview.value = null;
      importFile.value = null;
      if (fileInputRef.value) fileInputRef.value.value = '';
    } else {
      importError.value = res.error || 'Import failed';
    }
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Import failed';
  } finally {
    importing.value = false;
  }
}

// --- Export Identity Key ---
const showIdentityConfirm = ref(false);
const identityExporting = ref(false);
const identityData = ref<{
  identity_key_hex: string;
  key_length_bytes: number;
  public_key_hex?: string;
  node_address?: string;
} | null>(null);
const identityError = ref('');

async function exportIdentity() {
  identityExporting.value = true;
  identityError.value = '';
  try {
    const res = await ApiService.exportIdentityKey();
    if (!res.success || !res.data) {
      identityError.value = res.error || 'Export failed';
      return;
    }
    identityData.value = res.data;

    // Download as plain text hex file
    const blob = new Blob([res.data.identity_key_hex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pymc-identity-${res.data.node_address || 'key'}.hex`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    identityError.value = err instanceof Error ? err.message : 'Export failed';
  } finally {
    identityExporting.value = false;
  }
}
</script>
