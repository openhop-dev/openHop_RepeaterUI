<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import ApiService from '@/utils/api';
import type { ACLClient } from '@/generated/openapi';
import Spinner from '@/components/ui/Spinner.vue';
import { useDialogFocus } from '@/composables/useDialogFocus';
import {
  ACL_ASSIGNABLE_ROLES,
  ACL_ROLE_ADMIN,
  ACL_ROLE_MASK,
  aclRoleLabel,
  normalizePublicKey,
  withAclRole,
} from '@/utils/aclRoles';

defineOptions({ name: 'AclEntryModal' });

interface AclIdentity {
  name: string;
  type?: string;
}

const props = defineProps<{
  show: boolean;
  identities: AclIdentity[];
  /** Entries already listed, so adding a listed key keeps its upper permission bits. */
  entries: ACLClient[];
  /** Identity to preselect, e.g. the one the list is filtered to. */
  initialIdentity?: string | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', message: string): void;
}>();

const identityName = ref('');
const publicKeyText = ref('');
// No default: a key added here logs in without a password, so the role is
// always a deliberate choice, as setperm requires one.
const role = ref<number | null>(null);
const saving = ref(false);
const error = ref<string | null>(null);
const touched = ref(false);

const dialog = ref<HTMLElement | null>(null);
const keyInput = ref<HTMLInputElement | null>(null);

function close() {
  if (!saving.value) emit('close');
}

useDialogFocus(toRef(props, 'show'), dialog, close, keyInput);

const publicKey = computed(() => normalizePublicKey(publicKeyText.value));
const keyError = computed(() =>
  touched.value && !publicKey.value ? 'Paste the full public key: 64 hex characters.' : null,
);
const selectedIdentity = computed(() =>
  props.identities.find((identity) => identity.name === identityName.value),
);
const isRoomServer = computed(() => selectedIdentity.value?.type === 'room_server');
const existing = computed(() =>
  props.entries.find(
    (entry) =>
      entry.identity_name === identityName.value && entry.public_key_full === publicKey.value,
  ),
);
const identityError = computed(() =>
  touched.value && !identityName.value ? 'Choose the identity this key gets access to.' : null,
);
const roleError = computed(() =>
  touched.value && role.value === null ? 'Choose the role this key logs in as.' : null,
);
const needsRoomWarning = computed(
  () =>
    isRoomServer.value && role.value !== null && (role.value & ACL_ROLE_MASK) !== ACL_ROLE_ADMIN,
);

watch(
  () => props.show,
  (open) => {
    if (!open) return;
    // Never pick an identity on the operator's behalf when there is a choice:
    // the key gets access to whichever is selected.
    identityName.value =
      props.initialIdentity && props.identities.some((i) => i.name === props.initialIdentity)
        ? props.initialIdentity
        : props.identities.length === 1
          ? props.identities[0]!.name
          : '';
    publicKeyText.value = '';
    role.value = null;
    error.value = null;
    touched.value = false;
  },
  { immediate: true },
);

function identityLabel(identity: AclIdentity): string {
  if (identity.type === 'room_server') return `${identity.name} (room server)`;
  if (identity.type === 'repeater') return `${identity.name} (this device)`;
  return identity.name;
}

async function save() {
  // Submit is never disabled for bad input, so Enter always gets an answer:
  // marking the form touched shows what is missing.
  touched.value = true;
  if (saving.value || !identityName.value || !publicKey.value || role.value === null) return;
  saving.value = true;
  error.value = null;
  try {
    const response = await ApiService.setACLPermissions({
      identity_name: identityName.value,
      client_pubkey: publicKey.value,
      // A listed key keeps its upper bits; only the role changes.
      permissions: withAclRole(existing.value?.permissions_value, role.value),
    });
    if (response.success) {
      emit('saved', response.message || 'Entry saved');
    } else {
      error.value = response.error || 'Could not save the entry';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not save the entry';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-backdrop" @click.self="close">
      <div
        ref="dialog"
        class="modal-card max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acl-entry-title"
        aria-describedby="acl-entry-description"
      >
        <h3 id="acl-entry-title" class="text-xl font-semibold text-content-primary mb-1">
          Add access entry
        </h3>
        <p
          id="acl-entry-description"
          class="text-content-secondary dark:text-content-muted text-sm mb-2"
        >
          The key can then log in with a blank password, the same as
          <code class="font-mono">setperm</code> on the CLI.
        </p>

        <form class="modal-form" @submit.prevent="save">
          <div>
            <label for="acl-identity" class="modal-field-label">Identity</label>
            <select
              id="acl-identity"
              v-model="identityName"
              class="modal-select"
              aria-required="true"
              :aria-invalid="identityError !== null"
              :aria-describedby="identityError ? 'acl-identity-error' : undefined"
            >
              <option value="" disabled>Choose an identity…</option>
              <option v-for="identity in identities" :key="identity.name" :value="identity.name">
                {{ identityLabel(identity) }}
              </option>
            </select>
            <p
              v-if="identityError"
              id="acl-identity-error"
              class="text-xs mt-1 text-badge-red-text"
            >
              {{ identityError }}
            </p>
          </div>

          <div>
            <label for="acl-pubkey" class="modal-field-label">Public key</label>
            <input
              id="acl-pubkey"
              ref="keyInput"
              v-model="publicKeyText"
              type="text"
              class="modal-input font-mono"
              placeholder="64 hex characters"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="keyError !== null"
              aria-describedby="acl-pubkey-help"
              @blur="touched = publicKeyText.trim() !== '' || touched"
            />
            <p
              id="acl-pubkey-help"
              :class="['text-xs mt-1', keyError ? 'text-badge-red-text' : 'text-content-muted']"
            >
              {{ keyError || "The client's full public key, as shown in its app." }}
            </p>
            <p
              aria-live="polite"
              class="text-xs mt-1 text-content-secondary dark:text-content-muted"
            >
              <template v-if="existing">
                Already listed as {{ aclRoleLabel(existing.permissions) }}; saving changes its role.
              </template>
            </p>
          </div>

          <div>
            <label for="acl-role" class="modal-field-label">Role</label>
            <select
              id="acl-role"
              v-model="role"
              class="modal-select"
              aria-required="true"
              :aria-invalid="roleError !== null"
              :aria-describedby="
                needsRoomWarning ? 'acl-role-help acl-room-warning' : 'acl-role-help'
              "
            >
              <option :value="null" disabled>Choose a role…</option>
              <option
                v-for="option in ACL_ASSIGNABLE_ROLES"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <p
              id="acl-role-help"
              :class="['text-xs mt-1', roleError ? 'text-badge-red-text' : 'text-content-muted']"
            >
              {{ roleError || 'Required. The key logs in with a blank password as this role.' }}
            </p>
            <p v-if="needsRoomWarning" id="acl-room-warning" class="notice-warning text-xs mt-2">
              Room servers keep only admins after a restart, as MeshCore firmware does. This entry
              lasts until the next restart.
            </p>
          </div>

          <div v-if="error" class="notice-error" role="alert">{{ error }}</div>

          <div class="modal-actions">
            <button type="button" class="modal-btn-cancel" :disabled="saving" @click="close">
              Cancel
            </button>
            <button
              type="submit"
              class="modal-btn-primary flex items-center justify-center gap-2"
              :disabled="saving"
            >
              <Spinner v-if="saving" size="sm" color="current" />
              {{ saving ? 'Saving…' : existing ? 'Change role' : 'Add entry' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
