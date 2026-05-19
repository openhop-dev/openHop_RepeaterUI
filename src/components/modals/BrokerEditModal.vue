<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const ALL_PACKET_TYPES = [
  'REQ', 'RESPONSE', 'TXT_MSG', 'ACK', 'ADVERT', 'GRP_TXT',
  'GRP_DATA', 'ANON_REQ', 'PATH', 'TRACE', 'RAW_CUSTOM',
];

interface Broker {
  _id: number;
  enabled: boolean;
  name: string;
  host: string;
  port: number;
  format: string;
  audience?: string;
  use_jwt_auth?: boolean;
  username?: string;
  password?: string;
  disallowedInput?: string[];
  transport: string;
  base_topic?: string;
  retain_status: boolean;
  tls: { enabled?: boolean; insecure?: boolean };
}

interface Props {
  show: boolean;
  broker: Broker | null;
  isNew: boolean;
}

interface Emits {
  (e: 'done', data: Broker): void;
  (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function cloneBroker(b: Broker): Broker {
  return { ...b, tls: { ...b.tls }, disallowedInput: [...(b.disallowedInput ?? [])] };
}

const draft = ref<Broker>({
  _id: 0, enabled: true, name: '', host: '', port: 443, format: 'letsmesh',
  use_jwt_auth: false, transport: 'websockets', disallowedInput: [],
  retain_status: false, tls: { enabled: true, insecure: false },
});

watch(
  () => props.broker,
  (b) => { if (b) draft.value = cloneBroker(b); },
  { immediate: true },
);

const draftIsValid = computed(() => {
  const d = draft.value;
  return d.name.trim() !== '' && d.host.trim() !== '' &&
    d.port >= 1 && d.port <= 65535 &&
    (!d.use_jwt_auth || (d.audience?.trim() ?? '') !== '');
});

function onHostChange() {
  const d = draft.value;
  if (!d.audience || d.audience === d.host) d.audience = d.host;
}

function toggleDisallowed(type: string) {
  if (!draft.value.disallowedInput) draft.value.disallowedInput = [];
  const idx = draft.value.disallowedInput.indexOf(type);
  if (idx === -1) draft.value.disallowedInput.push(type);
  else draft.value.disallowedInput.splice(idx, 1);
}

function handleDone() {
  if (!draftIsValid.value) return;
  emit('done', cloneBroker(draft.value));
}

function handleCancel() {
  emit('cancel');
}

</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="show && broker"
        class="modal-backdrop"
        @click.self="handleCancel()"
      >
        <div class="modal-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">

          <!-- Header -->
          <div class="flex items-center justify-between mb-7">
            <div>
              <h3 class="text-xl font-semibold text-content-primary dark:text-content-primary">
                {{ isNew ? 'Add Broker' : 'Edit Broker' }}
              </h3>
              <p class="text-content-secondary dark:text-content-muted text-sm mt-1">
                {{ isNew ? 'Configure a new MQTT broker' : `Editing ${broker.name || '(unnamed)'}` }}
              </p>
            </div>
            <button @click="handleCancel" class="text-content-secondary dark:text-white/60 hover:text-content-primary dark:hover:text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Form -->
          <form @submit.prevent="handleDone" class="modal-form">

            <!-- Name (full width) -->
            <div>
              <label class="modal-field-label">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="draft.name"
                type="text"
                placeholder="Broker Name"
                class="modal-input"
              />
            </div>

            <!-- Row: Format (left) | Enabled (right) -->
            <div class="grid grid-cols-2 gap-5 items-end">
              <div>
                <label class="modal-field-label">
                  Format <span class="text-red-500">*</span>
                </label>
                <!-- The first three values belong to the MC2MQTT (MeshCoreToMQTT)
                     protocol family - all share the canonical topic
                     `meshcore/{IATA}/{PUBLIC_KEY}/...`. They differ only in
                     name flavor for downstream ingest pipelines. The legacy
                     `mqtt` value speaks an operator-defined custom topic. The
                     option list mirrors `MC2MQTT_FORMATS` in
                     `repeater/data_acquisition/mqtt_handler.py:99`. -->
                <select v-model="draft.format" class="modal-select">
                  <option value="meshcoretomqtt">Meshcoretomqtt</option>
                  <option value="letsmesh">Letsmesh</option>
                  <option value="waev">Waev</option>
                  <option value="mqtt">pyMC</option>
                </select>
              </div>
              <div class="flex items-center gap-3 pb-1.5">
                <button
                  type="button"
                  @click="draft.enabled = !draft.enabled"
                  :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', draft.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-white/15']"
                >
                  <span :class="['pointer-events-none absolute top-0.5 left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out', draft.enabled ? 'translate-x-4' : 'translate-x-0']" />
                </button>
                <span class="text-sm font-medium text-content-primary dark:text-content-primary">Enabled</span>
              </div>
            </div>

            <!-- Base Topic — left column only, shown when format = mqtt -->
            <div v-if="draft.format === 'mqtt'" class="grid grid-cols-2 gap-5">
              <div>
                <label class="modal-field-label">
                  MQTT Base Topic
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(e.g. meshcore/repeater)</span>
                </label>
                <input
                  v-model="draft.base_topic"
                  placeholder="meshcore/repeater"
                  class="modal-input"
                />
              </div>
              <div></div>
            </div>


            <!-- Row: Transport (left) | JWT Auth toggle (right) -->
            <div class="grid grid-cols-2 gap-5 items-end">
              <div>
                <label class="modal-field-label">
                  Transport <span class="text-red-500">*</span>
                </label>
                <select v-model="draft.transport" class="modal-select">
                  <option value="websockets">Websockets</option>
                  <option value="tcp">TCP</option>
                </select>
              </div>
              <div class="flex items-center gap-3 pb-1.5">
                <button
                  type="button"
                  @click="draft.use_jwt_auth = !draft.use_jwt_auth"
                  :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', draft.use_jwt_auth ? 'bg-primary' : 'bg-gray-200 dark:bg-white/15']"
                >
                  <span :class="['pointer-events-none absolute top-0.5 left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out', draft.use_jwt_auth ? 'translate-x-4' : 'translate-x-0']" />
                </button>
                <span class="text-sm font-medium text-content-primary dark:text-content-primary">Use JWT Auth</span>
              </div>
            </div>

            <!-- Rows: Host+Port (left) | Audience/Username + Password (right) — single grid to prevent height shifts -->
            <div class="grid grid-cols-2 gap-x-5 gap-y-0">
              <!-- Host -->
              <div>
                <label class="modal-field-label">
                  Host <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="draft.host"
                  type="text"
                  placeholder="mqtt.myserver.com"
                  @blur="onHostChange"
                  class="modal-input font-mono"
                />
              </div>

              <!-- Audience or Username -->
              <div>
                <template v-if="draft.use_jwt_auth">
                  <label class="modal-field-label">
                    Audience <span class="text-red-500">*</span>
                    <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(usually same as host)</span>
                  </label>
                  <input
                    v-model="draft.audience"
                    type="text"
                    placeholder="mqtt.myserver.com"
                    class="modal-input font-mono"
                  />
                </template>
                <template v-else>
                  <label class="modal-field-label">
                    Username
                    <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(blank = anonymous)</span>
                  </label>
                  <input type="text" autocomplete="username" style="display:none" />
                  <input
                    autocomplete="username"
                    v-model="draft.username"
                    type="text"
                    placeholder="username"
                    class="modal-input"
                  />
                </template>
              </div>

              <!-- Port -->
              <div>
                <label class="modal-field-label">
                  Port <span class="text-red-500">*</span>
                  <span class="font-normal text-content-muted dark:text-content-muted/60 ml-1">(443 WS, 1883 TCP)</span>
                </label>
                <input
                  v-model.number="draft.port"
                  type="number"
                  min="0"
                  max="65535"
                  class="modal-input font-mono"
                />
              </div>

              <!-- Password: always in DOM so grid row height never changes; invisible when JWT auth is on -->
              <div :class="draft.use_jwt_auth ? 'invisible pointer-events-none' : ''" :aria-hidden="draft.use_jwt_auth ? 'true' : undefined">
                <label class="modal-field-label">Password</label>
                <input type="password" autocomplete="current-password" style="display:none" />
                <input
                  autocomplete="new-password"
                  v-model="draft.password"
                  type="password"
                  readonly
                  onfocus="this.removeAttribute('readonly');"
                  onblur="this.setAttribute('readonly', true);"
                  class="modal-input"
                />
              </div>
            </div>


            <!-- Row: Retain Status (left) | TLS + Insecure (right) -->
            <div class="grid grid-cols-2 gap-5 items-center pt-4">
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  @click="draft.retain_status = !draft.retain_status"
                  :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', draft.retain_status ? 'bg-primary' : 'bg-gray-200 dark:bg-white/15']"
                >
                  <span :class="['pointer-events-none absolute top-0.5 left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out', draft.retain_status ? 'translate-x-4' : 'translate-x-0']" />
                </button>
                <div>
                  <span class="text-sm font-medium text-content-primary dark:text-content-primary">Retain Status</span>
                  <span class="text-xs text-content-muted dark:text-content-muted/60 ml-1">(MQTT retained)</span>
                </div>
              </div>
              <div class="flex items-center gap-6">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    @click="draft.tls.enabled = !draft.tls.enabled"
                    :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', draft.tls.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-white/15']"
                  >
                    <span :class="['pointer-events-none absolute top-0.5 left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out', draft.tls.enabled ? 'translate-x-4' : 'translate-x-0']" />
                  </button>
                  <span class="text-sm font-medium text-content-primary dark:text-content-primary">TLS</span>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    @click="draft.tls.insecure = !draft.tls.insecure"
                    :class="['relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none', draft.tls.insecure ? 'bg-amber-500' : 'bg-gray-200 dark:bg-white/15']"
                  >
                    <span :class="['pointer-events-none absolute top-0.5 left-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out', draft.tls.insecure ? 'translate-x-4' : 'translate-x-0']" />
                  </button>
                  <span class="text-sm font-medium text-content-primary dark:text-content-primary">Insecure</span>
                </div>
              </div>
            </div>


            <!-- Block Packet Types (full width) -->
            <div>
              <label class="modal-field-label">
                Block Packet Types
                <span class="text-content-secondary dark:text-content-muted font-normal text-xs ml-1">(prevent publishing to broker)</span>
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="type in ALL_PACKET_TYPES"
                  :key="type"
                  type="button"
                  @click="toggleDisallowed(type)"
                  :class="[
                    'px-2.5 py-1 rounded text-xs font-mono font-medium border transition-colors',
                    draft.disallowedInput?.includes(type)
                      ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50 text-red-700 dark:text-red-400'
                      : 'bg-background-mute dark:bg-white/5 border-stroke-subtle dark:border-stroke/10 text-content-secondary dark:text-content-muted hover:border-primary/40',
                  ]"
                >
                  {{ type }}
                </button>
              </div>
              <p class="mt-2 text-xs text-content-secondary dark:text-content-muted">
                <span class="text-red-600 dark:text-red-400 font-medium">Red = blocked.</span> Leave all unselected to publish all packet types.
              </p>
            </div>

            <!-- Actions -->
            <div class="modal-actions">
              <button
                type="button"
                @click="handleCancel"
                class="modal-btn-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!draftIsValid"
                :class="[
                  'flex-1 px-4 py-3 rounded-lg transition-colors font-medium',
                  draftIsValid
                    ? 'bg-accent-green/20 hover:bg-accent-green/30 border border-accent-green/50 text-accent-green'
                    : 'bg-background-mute dark:bg-white/5 border border-stroke-subtle dark:border-stroke/20 text-content-muted dark:text-content-muted/70 cursor-not-allowed',
                ]"
              >
                Done
              </button>
            </div>

          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
