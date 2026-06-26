<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ApiService from '@/utils/api';
import type {
  PolicyDocumentData,
  PolicyEngineConfig,
  PolicyGroup,
  PolicyGroupKind,
  PolicyGroups,
} from '@/types/api';
import Spinner from '@/components/ui/Spinner.vue';
import UnsavedChangesModal from '@/components/ui/UnsavedChangesModal.vue';
import { useUnsavedChanges } from '@/composables/useUnsavedChanges';

defineOptions({ name: 'PolicyEngineSettings' });

type PolicyAction =
  | 'allow'
  | 'drop'
  | 'log_only';

type RuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_or_equal'
  | 'less_than'
  | 'less_or_equal'
  | 'contains'
  | 'in'
  | 'intersects'
  | 'starts_with'
  | 'ends_with';

type RuleValueType = 'string' | 'number' | 'boolean';
type RuleMatchMode = 'all' | 'any';
type ValueSource = 'literal' | 'group';

interface FieldDefinition {
  value: string;
  label: string;
  valueTypes: RuleValueType[];
  operators: RuleOperator[];
  groupKinds?: PolicyGroupKind[];
}

interface LookupOption {
  label: string;
  value: string;
}

interface UiCondition {
  id: number;
  field: string;
  op: RuleOperator;
  valueType: RuleValueType;
  valueSource: ValueSource;
  value: string;
  groupKind?: PolicyGroupKind;
  groupId?: string;
}

interface UiRule {
  id: number;
  name: string;
  enabled: boolean;
  matchMode: RuleMatchMode;
  conditions: UiCondition[];
  action: PolicyAction;
}

const loading = ref(false);
const isEditing = ref(false);
const saving = ref(false);
const message = ref<string | null>(null);
const error = ref<string | null>(null);
let messageClearTimer: ReturnType<typeof setTimeout> | null = null;

const activeView = ref<'policy' | 'objects'>('policy');

const policyEngine = ref<PolicyEngineConfig>({
  enabled: false,
  default_action: 'allow',
  rules: [],
  objects: {},
});

const groups = ref<PolicyGroups>({
  channel_hashes: [],
  pubkeys: [],
});

const loadedPolicyEngine = ref<PolicyEngineConfig>({
  enabled: false,
  default_action: 'allow',
  rules: [],
  objects: {},
});

const loadedGroups = ref<PolicyGroups>({
  channel_hashes: [],
  pubkeys: [],
});

const rulesJson = ref('[]');
const useAdvancedJson = ref(false);
const uiRules = ref<UiRule[]>([]);
const validationInfo = ref<string | null>(null);

const showRuleModal = ref(false);
const editingRuleIndex = ref<number | null>(null);
const ruleDraft = ref<UiRule | null>(null);
const ruleModalError = ref<string | null>(null);
const showLogicMatrix = ref(false);
const draggingConditionIndex = ref<number | null>(null);
const dropInsertIndex = ref<number | null>(null);

const objectKind = ref<PolicyGroupKind>('channel_hashes');
const selectedGroupId = ref<string>('');

const newGroup = ref({
  friendly_name: '',
  description: '',
});

const newEntry = ref({
  friendly_name: '',
  value: '',
});

const actionOptions: Array<{ label: string; value: PolicyAction }> = [
  { label: 'Allow', value: 'allow' },
  { label: 'Drop', value: 'drop' },
  { label: 'Log Only', value: 'log_only' },
];

const operatorOptions: Array<{ label: string; value: RuleOperator }> = [
  { label: 'Equals', value: 'equals' },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Greater Than', value: 'greater_than' },
  { label: 'Greater or Equal', value: 'greater_or_equal' },
  { label: 'Less Than', value: 'less_than' },
  { label: 'Less or Equal', value: 'less_or_equal' },
  { label: 'Contains', value: 'contains' },
  { label: 'In List', value: 'in' },
  { label: 'Intersects', value: 'intersects' },
  { label: 'Starts With', value: 'starts_with' },
  { label: 'Ends With', value: 'ends_with' },
];

const fieldDefinitions: FieldDefinition[] = [
  {
    value: 'route_type',
    label: 'Route Type',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'less_than'],
  },
  {
    value: 'payload_type',
    label: 'Payload Type',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'less_than'],
  },
  {
    value: 'payload_length',
    label: 'Payload Length',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'],
  },
  {
    value: 'path_hash_size',
    label: 'Path Hash Size',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'less_than'],
  },
  {
    value: 'hop_count',
    label: 'Hop Count',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'],
  },
  {
    value: 'rssi',
    label: 'RSSI',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'],
  },
  {
    value: 'snr',
    label: 'SNR',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'],
  },
  {
    value: 'mode',
    label: 'Mode',
    valueTypes: ['string'],
    operators: ['equals', 'not_equals', 'in'],
  },
  {
    value: 'local_transmission',
    label: 'Local Transmission',
    valueTypes: ['boolean'],
    operators: ['equals', 'not_equals'],
  },
  {
    value: 'path_hashes',
    label: 'Path Hashes',
    valueTypes: ['string'],
    operators: ['contains', 'intersects'],
  },
  {
    value: 'channel_hash',
    label: 'Channel Hash',
    valueTypes: ['string'],
    operators: ['equals', 'not_equals', 'in'],
    groupKinds: ['channel_hashes'],
  },
  {
    value: 'channel_decryptable',
    label: 'Channel Decryptable',
    valueTypes: ['boolean'],
    operators: ['equals', 'not_equals'],
  },
  {
    value: 'channel_message_body',
    label: 'Channel Message Body',
    valueTypes: ['string'],
    operators: ['contains', 'starts_with', 'ends_with', 'equals', 'not_equals'],
  },
  {
    value: 'payload_hex',
    label: 'Payload Hex',
    valueTypes: ['string'],
    operators: ['contains', 'starts_with', 'ends_with', 'equals', 'not_equals'],
  },
  {
    value: 'transport_code_0',
    label: 'Transport Code 0',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'less_than'],
  },
  {
    value: 'transport_code_1',
    label: 'Transport Code 1',
    valueTypes: ['number'],
    operators: ['equals', 'not_equals', 'greater_than', 'less_than'],
  },
];

const fieldByKey = computed(() => {
  const map: Record<string, FieldDefinition> = {};
  for (const f of fieldDefinitions) map[f.value] = f;
  return map;
});

const hasAnyGroupSource = computed(() =>
  fieldDefinitions.some((f) => Array.isArray(f.groupKinds) && f.groupKinds.length > 0),
);

const conditionTableColspan = computed(() => (hasAnyGroupSource.value ? 8 : 7));

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slugifyDraftId(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function ensureUniqueId(base: string, existingIds: string[]): string {
  if (!existingIds.includes(base)) {
    return base;
  }

  let suffix = 2;
  while (existingIds.includes(`${base}_${suffix}`)) {
    suffix += 1;
  }
  return `${base}_${suffix}`;
}

function syncLoadedState(data: PolicyDocumentData) {
  loadedPolicyEngine.value = deepClone(data.policy_engine);
  loadedGroups.value = deepClone(data.groups);
}

function resetDraftState() {
  policyEngine.value = deepClone(loadedPolicyEngine.value);
  groups.value = deepClone(loadedGroups.value);
  rulesJson.value = JSON.stringify(policyEngine.value.rules, null, 2);
  uiRules.value = policyEngine.value.rules.map((rule, idx) => ruleToUi(rule, idx));
}

function startEditing() {
  message.value = null;
  error.value = null;
  validationInfo.value = null;
  isEditing.value = true;
}

function showSuccessMessage(text: string) {
  message.value = text;
  if (messageClearTimer) {
    clearTimeout(messageClearTimer);
  }
  messageClearTimer = setTimeout(() => {
    message.value = null;
    messageClearTimer = null;
  }, 3000);
}

function cancelEditing() {
  resetDraftState();
  isEditing.value = false;
  message.value = null;
  error.value = null;
  validationInfo.value = null;
  newGroup.value = { friendly_name: '', description: '' };
  newEntry.value = { friendly_name: '', value: '' };
  closeRuleModal();
}

function buildPolicyObjectsFromGroups(groupsConfig: PolicyGroups): Record<string, unknown> {
  const channelHashGroups = Object.fromEntries(
    groupsConfig.channel_hashes.map((group) => [group.id, group.entries.map((entry) => entry.value)]),
  );
  const pubkeyGroups = Object.fromEntries(
    groupsConfig.pubkeys.map((group) => [group.id, group.entries.map((entry) => entry.value)]),
  );

  return {
    channel_hash_groups: channelHashGroups,
    pubkey_groups: pubkeyGroups,
  };
}

function getPolicyObjectsForSubmit(): Record<string, unknown> {
  return {
    ...deepClone(policyEngine.value.objects || {}),
    ...buildPolicyObjectsFromGroups(groups.value),
  };
}

const { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel } = useUnsavedChanges(
  isEditing,
  saving,
  cancelEditing,
  async () => savePolicy(),
);

defineExpose({ requestLeave, isEditing });

function formatPolicyApiError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : fallback;
  if (raw.includes('404')) {
    return 'Policy API not available on the connected backend. Update/restart openHop Repeater so /api/policy, /api/policy_groups, and /api/policy_group_entries are exposed.';
  }
  return raw || fallback;
}

const currentGroups = computed(() => groups.value[objectKind.value] ?? []);

const selectedGroup = computed<PolicyGroup | null>(() => {
  return currentGroups.value.find((g) => g.id === selectedGroupId.value) ?? null;
});

watch([objectKind, currentGroups], () => {
  if (!currentGroups.value.length) {
    selectedGroupId.value = '';
    return;
  }
  if (!currentGroups.value.find((g) => g.id === selectedGroupId.value)) {
    selectedGroupId.value = currentGroups.value[0].id;
  }
});

function fieldLabel(value: string): string {
  return fieldByKey.value[value]?.label || value;
}

function operatorLabel(value: RuleOperator): string {
  return operatorOptions.find((o) => o.value === value)?.label || value;
}

function getAllowedOperators(field: string): RuleOperator[] {
  return fieldByKey.value[field]?.operators || ['equals', 'not_equals'];
}

function getAllowedValueTypes(field: string): RuleValueType[] {
  return fieldByKey.value[field]?.valueTypes || ['string'];
}

function getAllowedGroupKinds(field: string): PolicyGroupKind[] {
  return fieldByKey.value[field]?.groupKinds || [];
}

function getGroupsByKind(kind?: PolicyGroupKind): PolicyGroup[] {
  if (!kind) return [];
  return groups.value[kind] || [];
}

function supportsGroupSource(field: string): boolean {
  return getAllowedGroupKinds(field).length > 0;
}

function getLiteralLookupOptions(condition: UiCondition): LookupOption[] {
  // Type-level defaults
  if (condition.valueType === 'boolean') {
    return [
      { label: 'true', value: 'true' },
      { label: 'false', value: 'false' },
    ];
  }

  // Field-specific lookups
  switch (condition.field) {
    case 'mode':
      return [
        { label: 'Forward', value: 'forward' },
        { label: 'Monitor', value: 'monitor' },
        { label: 'No TX', value: 'no_tx' },
      ];
    case 'route_type':
      return [
        { label: '0 - Transport Flood', value: '0' },
        { label: '1 - Flood', value: '1' },
        { label: '2 - Direct', value: '2' },
        { label: '3 - Transport Direct', value: '3' },
      ];
    case 'path_hash_size':
      return [
        { label: '1 byte', value: '1' },
        { label: '2 bytes', value: '2' },
        { label: '3 bytes', value: '3' },
      ];
    case 'payload_type':
      return [
        { label: '0 - REQ', value: '0' },
        { label: '1 - RESPONSE', value: '1' },
        { label: '2 - TXT_MSG', value: '2' },
        { label: '3 - ACK', value: '3' },
        { label: '4 - ADVERT', value: '4' },
        { label: '5 - GRP_TXT', value: '5' },
        { label: '6 - GRP_DATA', value: '6' },
        { label: '7 - ANON_REQ', value: '7' },
        { label: '8 - PATH', value: '8' },
        { label: '9 - TRACE', value: '9' },
        { label: '10 - MULTIPART', value: '10' },
        { label: '15 - RAW_CUSTOM', value: '15' },
      ];
    default:
      return [];
  }
}

function applyLookupValue(condition: UiCondition, value: string) {
  if (!value) return;
  condition.value = value;
}

function isPathHashesField(field: string): boolean {
  return field === 'path_hashes';
}

function isChannelHashField(field: string): boolean {
  return field === 'channel_hash';
}

function normalizeChannelHashToken(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Channel hash value is required');
  }

  const normalizedHex = raw.replace(/^0x/i, '');
  if (/^[0-9a-fA-F]+$/.test(normalizedHex)) {
    if (normalizedHex.length % 2 !== 0) {
      throw new Error('Channel hash/secret must have an even number of hex characters.');
    }

    // Full channel secret key is accepted here; backend preserves it for channel-hash groups.
    if (normalizedHex.length === 32 || normalizedHex.length === 64) {
      return `0x${normalizedHex.toUpperCase()}`;
    }

    // Single-byte channel hash (common case).
    if (normalizedHex.length <= 2) {
      const parsed = Number.parseInt(normalizedHex, 16);
      return `0x${parsed.toString(16).toUpperCase().padStart(2, '0')}`;
    }

    // Allow other hex lengths to pass through; backend will validate final semantics.
    return `0x${normalizedHex.toUpperCase()}`;
  }

  let parsed: number;
  if (/^[0-9]+$/.test(raw)) {
    parsed = Number.parseInt(raw, 10);
  } else {
    throw new Error(`Invalid channel hash value: ${value}`);
  }

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid channel hash value: ${value}`);
  }
  if (parsed > 0xff) {
    throw new Error('Decimal channel hash must be within 0-255. Use hex secret key for full channel keys.');
  }

  return `0x${parsed.toString(16).toUpperCase().padStart(2, '0')}`;
}

function normalizePathHashToken(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Path hash value is required');
  }

  const hex = raw.replace(/^0x/i, '');
  if (!hex) {
    throw new Error('Path hash value is required');
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid path hash value: ${value}`);
  }
  if (hex.length % 2 !== 0) {
    throw new Error(`Path hash must have an even number of hex characters: ${value}`);
  }
  if (![2, 4, 6].includes(hex.length)) {
    throw new Error(`Path hash must be 1, 2, or 3 bytes: ${value}`);
  }

  return `0x${hex.toUpperCase()}`;
}

function parsePathHashList(value: string): string[] {
  const tokens = value
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (!tokens.length) {
    throw new Error('At least one path hash is required');
  }

  const hashes = tokens.map(normalizePathHashToken);
  const byteLengths = new Set(hashes.map((hash) => hash.replace(/^0x/i, '').length));
  if (byteLengths.size > 1) {
    throw new Error('Path hashes in one condition must all use the same byte length.');
  }
  return hashes;
}

function stringifyConditionValue(field: string, value: unknown): string {
  if (isPathHashesField(field) && Array.isArray(value)) {
    return value.map((item) => normalizePathHashToken(String(item))).join('\n');
  }
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseConditionLiteralValue(condition: UiCondition): string | number | boolean | string[] {
  const trimmed = condition.value.trim();
  if (isPathHashesField(condition.field)) {
    const hashes = parsePathHashList(trimmed);
    if (condition.op === 'contains') {
      if (hashes.length !== 1) {
        throw new Error('Path Hashes with Contains expects one hash. Use Intersects for multiple hashes.');
      }
      return hashes[0];
    }
    return hashes;
  }

  if (isChannelHashField(condition.field)) {
    return normalizeChannelHashToken(trimmed);
  }

  return parseLiteralValue(trimmed, condition.valueType);
}

function getLiteralPlaceholder(condition: UiCondition): string {
  if (isPathHashesField(condition.field)) {
    if (condition.op === 'contains') {
      return 'Single hash, e.g. 0x42, 0x0042, or 0x000042';
    }
    return 'One hash per line or comma-separated; all must be the same size';
  }
  if (isChannelHashField(condition.field)) {
    return '1-byte channel hash (0x11) or full channel secret key';
  }
  return condition.valueType === 'boolean' ? 'true/false' : 'value';
}

function useMultilineLiteralInput(condition: UiCondition): boolean {
  return isPathHashesField(condition.field) && condition.valueSource === 'literal';
}

function toValueType(value: unknown): RuleValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function parseLiteralValue(value: string, valueType: RuleValueType): string | number | boolean {
  if (valueType === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric value: ${value}`);
    }
    return parsed;
  }
  if (valueType === 'boolean') {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
    throw new Error(`Invalid boolean value: ${value}. Use true or false.`);
  }
  return value;
}

function makeCondition(id: number): UiCondition {
  return {
    id,
    field: 'hop_count',
    op: 'greater_than',
    valueType: 'number',
    valueSource: 'literal',
    value: '2',
  };
}

function makeRule(id: number): UiRule {
  return {
    id,
    name: `Rule ${id}`,
    enabled: true,
    matchMode: 'all',
    conditions: [makeCondition(1)],
    action: 'drop',
  };
}

function nextRuleId(): number {
  if (!uiRules.value.length) return 1;
  return Math.max(...uiRules.value.map((r) => Number(r.id) || 0)) + 1;
}

function nextConditionId(rule: UiRule): number {
  if (!rule.conditions.length) return 1;
  return Math.max(...rule.conditions.map((c) => c.id)) + 1;
}

function applyFieldConstraints(condition: UiCondition) {
  const ops = getAllowedOperators(condition.field);
  if (!ops.includes(condition.op)) {
    condition.op = ops[0];
  }

  const types = getAllowedValueTypes(condition.field);
  if (!types.includes(condition.valueType)) {
    condition.valueType = types[0];
  }

  const groupKinds = getAllowedGroupKinds(condition.field);
  if (!groupKinds.length) {
    condition.valueSource = 'literal';
    condition.groupKind = undefined;
    condition.groupId = undefined;
    return;
  }

  if (condition.valueSource === 'group') {
    if (!condition.groupKind || !groupKinds.includes(condition.groupKind)) {
      condition.groupKind = groupKinds[0];
    }
    if (isChannelHashField(condition.field) && condition.op !== 'in') {
      condition.op = 'in';
    }
    const avail = getGroupsByKind(condition.groupKind);
    if (!avail.find((g) => g.id === condition.groupId)) {
      condition.groupId = avail[0]?.id;
    }
  }
}

function ruleToUi(raw: Record<string, unknown>, index: number): UiRule {
  const condObj = (raw.if as Record<string, unknown> | undefined) ?? {};
  let mode: RuleMatchMode = 'all';
  let condsRaw: Array<Record<string, unknown>> = [];

  if (Array.isArray(condObj.any)) {
    mode = 'any';
    condsRaw = condObj.any as Array<Record<string, unknown>>;
  } else if (Array.isArray(condObj.all)) {
    mode = 'all';
    condsRaw = condObj.all as Array<Record<string, unknown>>;
  } else if ('field' in condObj) {
    condsRaw = [condObj];
  }

  if (!condsRaw.length) {
    condsRaw = [{ field: 'hop_count', op: 'greater_than', value: 2 }];
  }

  const conditions: UiCondition[] = condsRaw.map((cond, condIndex) => {
    const field = String(cond.field ?? 'hop_count');
    const opRaw = String(cond.op ?? 'equals') as RuleOperator;
    const allowedOps = getAllowedOperators(field);
    const op = allowedOps.includes(opRaw) ? opRaw : allowedOps[0];

    const rawValue = cond.value;
    const isGroupRef = typeof rawValue === 'string' && rawValue.startsWith('@');
    if (isGroupRef) {
      const ref = rawValue.slice(1);
      const [groupKey, groupId] = ref.split('.', 2);
      const groupKind =
        groupKey === 'channel_hash_groups'
          ? 'channel_hashes'
          : groupKey === 'pubkey_groups'
            ? 'pubkeys'
            : undefined;

      const uiCondition: UiCondition = {
        id: condIndex + 1,
        field,
        op,
        valueType: 'string',
        valueSource: 'group',
        value: groupId || '',
        groupKind,
        groupId,
      };
      applyFieldConstraints(uiCondition);
      return uiCondition;
    }

    const valueType = toValueType(rawValue);
    const uiCondition: UiCondition = {
      id: condIndex + 1,
      field,
      op,
      valueType: getAllowedValueTypes(field).includes(valueType)
        ? valueType
        : getAllowedValueTypes(field)[0],
      valueSource: 'literal',
      value: stringifyConditionValue(field, rawValue),
    };
    applyFieldConstraints(uiCondition);
    return uiCondition;
  });

  const thenBlock = (raw.then as Record<string, unknown> | undefined) ?? {};
  const actionRaw = String(thenBlock.action ?? raw.action ?? 'allow');
  const action = actionOptions.some((a) => a.value === actionRaw)
    ? (actionRaw as PolicyAction)
    : 'allow';

  return {
    id: Number(raw.id ?? index + 1),
    name: String(raw.name ?? `Rule ${index + 1}`),
    enabled: Boolean(raw.enabled ?? true),
    matchMode: mode,
    conditions,
    action,
  };
}

function uiToRule(rule: UiRule, index: number): Record<string, unknown> {
  const conds = rule.conditions.map((cond) => {
    let value: unknown;
    if (cond.valueSource === 'group') {
      if (!cond.groupKind || !cond.groupId) {
        throw new Error(`Condition ${cond.id} in ${rule.name} is missing group selection`);
      }
      const objectKey = cond.groupKind === 'channel_hashes' ? 'channel_hash_groups' : 'pubkey_groups';
      value = `@${objectKey}.${cond.groupId}`;
    } else {
      value = parseConditionLiteralValue(cond);
    }

    return {
      field: cond.field,
      op: cond.op,
      value,
    };
  });

  return {
    id: Number(rule.id) || index + 1,
    name: rule.name.trim() || `Rule ${index + 1}`,
    enabled: Boolean(rule.enabled),
    if: {
      [rule.matchMode]: conds,
    },
    then: {
      action: rule.action,
    },
  };
}

function syncRulesJsonFromUi() {
  const rules = uiRules.value.map((rule, idx) => uiToRule(rule, idx));
  rulesJson.value = JSON.stringify(rules, null, 2);
}

function normalizeRulesFromEditor(): Array<Record<string, unknown>> {
  const parsed = JSON.parse(rulesJson.value);
  if (!Array.isArray(parsed)) {
    throw new Error('Rules must be a JSON array');
  }
  return parsed as Array<Record<string, unknown>>;
}

function syncUiFromRulesJson() {
  const parsed = normalizeRulesFromEditor();
  uiRules.value = parsed.map((r, idx) => ruleToUi(r, idx));
}

function getRulesForSubmit(): Array<Record<string, unknown>> {
  if (useAdvancedJson.value) {
    return normalizeRulesFromEditor();
  }
  return uiRules.value.map((rule, idx) => uiToRule(rule, idx));
}

function summarizeCondition(condition: UiCondition): string {
  if (condition.valueSource === 'group') {
    return `${fieldLabel(condition.field)} ${operatorLabel(condition.op)} ${condition.groupKind}:${condition.groupId || 'unset'}`;
  }
  if (isPathHashesField(condition.field)) {
    const count = condition.value
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean).length;
    return `${fieldLabel(condition.field)} ${operatorLabel(condition.op)} ${count} hash${count === 1 ? '' : 'es'}`;
  }
  return `${fieldLabel(condition.field)} ${operatorLabel(condition.op)} ${condition.value}`;
}

function summarizeRule(rule: UiRule): string {
  const joiner = rule.matchMode === 'all' ? ' AND ' : ' OR ';
  return rule.conditions.map((c) => summarizeCondition(c)).join(joiner);
}

function actionLabel(action: PolicyAction): string {
  return action === 'log_only' ? 'Log Only' : action.charAt(0).toUpperCase() + action.slice(1);
}

function actionBadgeClasses(action: PolicyAction): string {
  if (action === 'drop') {
    return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300';
  }
  if (action === 'log_only') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

function openAddRuleModal() {
  editingRuleIndex.value = null;
  ruleDraft.value = makeRule(nextRuleId());
  ruleModalError.value = null;
  showRuleModal.value = true;
}

function openEditRuleModal(index: number) {
  const existing = uiRules.value[index];
  if (!existing) return;
  editingRuleIndex.value = index;
  ruleDraft.value = JSON.parse(JSON.stringify(existing)) as UiRule;
  ruleModalError.value = null;
  showRuleModal.value = true;
}

function closeRuleModal() {
  showRuleModal.value = false;
  ruleDraft.value = null;
  editingRuleIndex.value = null;
  ruleModalError.value = null;
  showLogicMatrix.value = false;
  draggingConditionIndex.value = null;
  dropInsertIndex.value = null;
}

function addDraftCondition() {
  if (!ruleDraft.value) return;
  const cond = makeCondition(nextConditionId(ruleDraft.value));
  ruleDraft.value.conditions.push(cond);
}

function removeDraftCondition(index: number) {
  if (!ruleDraft.value) return;
  if (ruleDraft.value.conditions.length <= 1) return;
  ruleDraft.value.conditions.splice(index, 1);
}

function moveDraftCondition(index: number, direction: -1 | 1) {
  if (!ruleDraft.value) return;
  const toIndex = index + direction;
  if (toIndex < 0 || toIndex >= ruleDraft.value.conditions.length) return;
  const current = ruleDraft.value.conditions[index];
  ruleDraft.value.conditions[index] = ruleDraft.value.conditions[toIndex];
  ruleDraft.value.conditions[toIndex] = current;
}

function onConditionDragStart(index: number, event: DragEvent) {
  draggingConditionIndex.value = index;
  dropInsertIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onConditionDragOver(index: number, event: DragEvent) {
  if (draggingConditionIndex.value === null) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }

  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const beforeMidpoint = event.clientY < rect.top + rect.height / 2;
  dropInsertIndex.value = beforeMidpoint ? index : index + 1;
}

function onConditionDrop(event: DragEvent) {
  event.preventDefault();
  if (!ruleDraft.value || draggingConditionIndex.value === null) return;
  if (dropInsertIndex.value === null) return;

  const fromIndex = draggingConditionIndex.value;
  let targetInsertIndex = dropInsertIndex.value;

  if (targetInsertIndex > fromIndex) {
    targetInsertIndex -= 1;
  }

  if (targetInsertIndex === fromIndex) {
    draggingConditionIndex.value = null;
    dropInsertIndex.value = null;
    return;
  }

  const moved = ruleDraft.value.conditions.splice(fromIndex, 1)[0];
  if (!moved) {
    draggingConditionIndex.value = null;
    dropInsertIndex.value = null;
    return;
  }

  ruleDraft.value.conditions.splice(targetInsertIndex, 0, moved);

  draggingConditionIndex.value = null;
  dropInsertIndex.value = null;
}

function onConditionDragEnd() {
  draggingConditionIndex.value = null;
  dropInsertIndex.value = null;
}

function onDraftConditionFieldChange(condition: UiCondition) {
  applyFieldConstraints(condition);
}

function getChannelBodyGuardWarning(rule: UiRule): string | null {
  const hasChannelBody = rule.conditions.some((c) => c.field === 'channel_message_body');
  if (!hasChannelBody) {
    return null;
  }

  const channelBodyIndex = rule.conditions.findIndex((c) => c.field === 'channel_message_body');
  if (channelBodyIndex <= 0) {
    return 'For best results, move Channel Message Body lower in the list. Put Channel Decryptable == true or Channel Hash above it.';
  }

  const hasPriorGate = rule.conditions.slice(0, channelBodyIndex).some((cond) => {
    if (cond.field === 'channel_decryptable' && cond.op === 'equals') {
      return cond.value.trim().toLowerCase() === 'true';
    }
    return cond.field === 'channel_hash';
  });

  if (!hasPriorGate) {
    return 'Change the order: put Channel Decryptable == true or Channel Hash before Channel Message Body.';
  }

  return null;
}

function saveRuleModal() {
  if (!ruleDraft.value) return;
  ruleModalError.value = null;

  try {
    if (!ruleDraft.value.name.trim()) {
      throw new Error('Rule name is required');
    }
    if (!ruleDraft.value.conditions.length) {
      throw new Error('At least one condition is required');
    }

    for (const cond of ruleDraft.value.conditions) {
      applyFieldConstraints(cond);
      if (cond.valueSource === 'group') {
        if (!cond.groupKind || !cond.groupId) {
          throw new Error(`Select a group for ${fieldLabel(cond.field)}`);
        }
      } else {
        if (!cond.value.trim()) {
          throw new Error(`Condition value is required for ${fieldLabel(cond.field)}`);
        }
        parseConditionLiteralValue(cond);
      }
    }

    const toPersist = JSON.parse(JSON.stringify(ruleDraft.value)) as UiRule;
    if (editingRuleIndex.value === null) {
      uiRules.value.push(toPersist);
    } else {
      uiRules.value.splice(editingRuleIndex.value, 1, toPersist);
    }

    syncRulesJsonFromUi();
    closeRuleModal();
  } catch (err) {
    ruleModalError.value = err instanceof Error ? err.message : 'Failed to save rule';
  }
}

function removeRule(index: number) {
  uiRules.value.splice(index, 1);
  syncRulesJsonFromUi();
}

function moveRule(index: number, direction: -1 | 1) {
  const toIndex = index + direction;
  if (toIndex < 0 || toIndex >= uiRules.value.length) return;
  const current = uiRules.value[index];
  uiRules.value[index] = uiRules.value[toIndex];
  uiRules.value[toIndex] = current;
  syncRulesJsonFromUi();
}

function asPolicyDocumentData(raw: unknown): PolicyDocumentData {
  const fallback: PolicyDocumentData = {
    policy_engine: {
      enabled: false,
      default_action: 'allow',
      rules: [],
      objects: {},
    },
    groups: {
      channel_hashes: [],
      pubkeys: [],
    },
  };

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const data = raw as Record<string, unknown>;
  const engineRaw = (data.policy_engine ?? {}) as Record<string, unknown>;
  const groupsRaw = (data.groups ?? {}) as Record<string, unknown>;

  const safeGroups = {
    channel_hashes: Array.isArray(groupsRaw.channel_hashes)
      ? (groupsRaw.channel_hashes as PolicyGroup[])
      : [],
    pubkeys: Array.isArray(groupsRaw.pubkeys) ? (groupsRaw.pubkeys as PolicyGroup[]) : [],
  };

  return {
    policy_file: typeof data.policy_file === 'string' ? data.policy_file : undefined,
    exists: Boolean(data.exists),
    policy_engine: {
      enabled: Boolean(engineRaw.enabled),
      default_action:
        typeof engineRaw.default_action === 'string' ? engineRaw.default_action : 'allow',
      rules: Array.isArray(engineRaw.rules) ? (engineRaw.rules as Array<Record<string, unknown>>) : [],
      objects:
        engineRaw.objects && typeof engineRaw.objects === 'object'
          ? (engineRaw.objects as Record<string, unknown>)
          : {},
    },
    groups: safeGroups,
  };
}

async function loadPolicy() {
  loading.value = true;
  error.value = null;
  message.value = null;

  try {
    const response = await ApiService.getPolicyDocument();
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to load policy document');
    }

    const data = asPolicyDocumentData(response.data);
    syncLoadedState(data);
    resetDraftState();
  } catch (err) {
    error.value = formatPolicyApiError(err, 'Failed to load policy');
  } finally {
    loading.value = false;
  }
}

async function validatePolicy() {
  error.value = null;
  message.value = null;
  validationInfo.value = null;

  try {
    const rules = getRulesForSubmit();
    const validateResponse = await ApiService.validatePolicyDocument({
      policy_engine: {
        enabled: policyEngine.value.enabled,
        default_action: policyEngine.value.default_action,
        rules,
        objects: getPolicyObjectsForSubmit(),
      },
    });

    if (!validateResponse.success || !validateResponse.data) {
      throw new Error(validateResponse.error || 'Validation failed');
    }

    if (validateResponse.data.valid) {
      const effective = validateResponse.data.effective;
      validationInfo.value =
        `Valid policy. Enabled=${effective?.enabled ? 'yes' : 'no'}, ` +
        `default=${effective?.default_action || policyEngine.value.default_action}, ` +
        `rules=${effective?.rule_count ?? rules.length}`;
      return;
    }

    throw new Error(validateResponse.data.error || 'Invalid policy payload');
  } catch (err) {
    error.value = formatPolicyApiError(err, 'Validation failed');
  }
}

async function savePolicy(): Promise<boolean> {
  saving.value = true;
  error.value = null;
  message.value = null;
  validationInfo.value = null;

  try {
    const rules = getRulesForSubmit();

    const payload = {
      policy_engine: {
        enabled: policyEngine.value.enabled,
        default_action: policyEngine.value.default_action,
        rules,
        objects: getPolicyObjectsForSubmit(),
      },
      groups: groups.value,
    };

    const response = await ApiService.updatePolicyDocument(payload);
    if (!response.success) {
      throw new Error(response.error || 'Failed to save policy');
    }

    const successText = response.message || 'Settings saved successfully';
    await loadPolicy();
    isEditing.value = false;
    showSuccessMessage(successText);
    return true;
  } catch (err) {
    error.value = formatPolicyApiError(err, 'Failed to save policy');
    return false;
  } finally {
    saving.value = false;
  }
}

function createGroup() {
  error.value = null;
  message.value = null;

  const friendlyName = newGroup.value.friendly_name.trim();
  if (!friendlyName) {
    error.value = 'Group friendly name is required';
    return;
  }

  const groupList = groups.value[objectKind.value];
  const groupId = ensureUniqueId(
    slugifyDraftId(friendlyName, `${objectKind.value}_group`),
    groupList.map((group) => group.id),
  );

  groupList.push({
    id: groupId,
    friendly_name: friendlyName,
    description: newGroup.value.description.trim() || undefined,
    entries: [],
  });
  selectedGroupId.value = groupId;
  newGroup.value = { friendly_name: '', description: '' };
  validationInfo.value = null;
}

function deleteGroup(groupId: string) {
  error.value = null;
  message.value = null;

  groups.value[objectKind.value] = groups.value[objectKind.value].filter((group) => group.id !== groupId);
  validationInfo.value = null;
}

function addEntry() {
  error.value = null;
  message.value = null;

  if (!selectedGroup.value) {
    error.value = 'Select a group first';
    return;
  }

  const friendlyName = newEntry.value.friendly_name.trim();
  const value = newEntry.value.value.trim();

  if (!friendlyName || !value) {
    error.value = 'Entry friendly name and value are required';
    return;
  }

  const entryId = ensureUniqueId(
    slugifyDraftId(friendlyName || value, 'entry'),
    selectedGroup.value.entries.map((entry) => entry.id),
  );

  selectedGroup.value.entries.push({
    id: entryId,
    friendly_name: friendlyName,
    value,
  });
  newEntry.value = { friendly_name: '', value: '' };
  validationInfo.value = null;
}

function removeEntry(entryId: string) {
  error.value = null;
  message.value = null;

  if (!selectedGroup.value) {
    error.value = 'Select a group first';
    return;
  }

  selectedGroup.value.entries = selectedGroup.value.entries.filter((entry) => entry.id !== entryId);
  validationInfo.value = null;
}

onMounted(loadPolicy);
</script>

<template>
  <UnsavedChangesModal
    :show="showUnsavedModal"
    :is-saving="saving"
    label="Policy Engine settings"
    @discard="handleDiscard"
    @save="handleSave"
    @cancel="handleCancel"
  />

  <div class="space-y-6">
    <div class="cfg-page-heading flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h3 class="text-base sm:text-lg font-semibold text-content-primary mb-1 sm:mb-2">
          Policy Engine
        </h3>
        <p class="text-content-secondary dark:text-content-muted text-xs sm:text-sm">
          Policy and object management with chained rule conditions
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          v-if="!isEditing"
          class="cfg-btn-primary"
          :disabled="loading"
          @click="startEditing"
        >
          Edit Settings
        </button>
        <template v-else>
          <button
            class="cfg-btn-secondary"
            :disabled="saving"
            @click="cancelEditing"
          >
            Cancel
          </button>
          <button
            class="cfg-btn-primary"
            :disabled="saving"
            @click="savePolicy"
          >
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </template>
      </div>
    </div>
    <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-if="message" class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-700 dark:text-emerald-400 text-sm">
      {{ message }}
    </div>

    <div v-if="validationInfo" class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-700 dark:text-blue-300 text-sm">
      {{ validationInfo }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-10">
      <Spinner />
      <span class="ml-2 text-content-secondary dark:text-content-muted">Loading policy…</span>
    </div>

    <template v-else>
      <div class="cfg-section">
        <div class="flex flex-wrap items-center gap-2">
          <button
            class="px-3 py-1.5 text-xs sm:text-sm rounded-md border transition-colors"
            :class="activeView === 'policy'
              ? 'border-primary/60 text-primary bg-primary/10'
              : 'border-stroke-subtle dark:border-stroke/30 text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary'"
            @click="activeView = 'policy'"
          >
            Policy
          </button>
          <button
            class="px-3 py-1.5 text-xs sm:text-sm rounded-md border transition-colors"
            :class="activeView === 'objects'
              ? 'border-primary/60 text-primary bg-primary/10'
              : 'border-stroke-subtle dark:border-stroke/30 text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary'"
            @click="activeView = 'objects'"
          >
            Objects
          </button>
        </div>
      </div>

      <div v-if="activeView === 'policy'" class="space-y-4">
        <div class="cfg-section space-y-4">
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <div class="rounded-xl border border-stroke-subtle dark:border-stroke/20 bg-background-mute/50 dark:bg-white/5 px-4 py-4 flex items-center justify-between gap-4">
              <div>
                <label class="cfg-label">Policy Engine Enabled</label>
                <p class="mt-1 text-xs text-content-muted">Enable policy enforcement for incoming packets.</p>
              </div>
              <label class="inline-flex items-center gap-3 rounded-full border border-stroke-subtle dark:border-stroke/20 bg-background-main dark:bg-surface-900 px-3 py-2 text-sm font-medium text-content-primary shadow-sm">
                <input
                  v-model="policyEngine.enabled"
                  type="checkbox"
                  :disabled="!isEditing || saving"
                  class="h-4 w-4 rounded border-stroke-subtle dark:border-stroke/30 accent-primary"
                />
                <span>Enable policy enforcement</span>
              </label>
            </div>
            <div class="rounded-xl border border-stroke-subtle dark:border-stroke/20 bg-background-mute/50 dark:bg-white/5 px-4 py-4 flex flex-col justify-between gap-3">
              <div>
                <label class="cfg-label">Default Action</label>
                <p class="mt-1 text-xs text-content-muted">Applied when no policy rule matches.</p>
              </div>
              <select v-model="policyEngine.default_action" class="cfg-select w-full md:max-w-sm" :disabled="!isEditing || saving">
                <option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label class="cfg-label">Policy Rules</label>
              <div class="flex items-center gap-2">
                <button class="cfg-btn-secondary text-xs" :disabled="!isEditing || saving" @click="openAddRuleModal">Add Rule</button>
                <button
                  class="cfg-btn-secondary text-xs"
                  :disabled="saving"
                  @click="useAdvancedJson = !useAdvancedJson"
                >
                  {{ useAdvancedJson ? 'Hide JSON' : 'Advanced JSON' }}
                </button>
              </div>
            </div>

            <div class="overflow-x-auto rounded-2xl border border-stroke-subtle dark:border-stroke/20 bg-background-main dark:bg-surface-900 shadow-sm">
              <table class="w-full min-w-[980px] table-fixed text-sm">
                <thead class="bg-background-mute/80 dark:bg-white/5 backdrop-blur">
                  <tr>
                    <th class="w-16 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">Order</th>
                    <th class="w-14 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">On</th>
                    <th class="w-44 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">Name</th>
                    <th class="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">Logic</th>
                    <th class="w-28 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">Action</th>
                    <th class="w-48 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-content-muted">Controls</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(rule, idx) in uiRules"
                    :key="`${rule.id}-${idx}`"
                    class="border-t border-stroke-subtle/70 dark:border-stroke/15 odd:bg-background-mute/20 dark:odd:bg-white/[0.02] hover:bg-primary/5 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <td class="px-3 py-3 text-xs font-medium text-content-secondary">{{ idx + 1 }}</td>
                    <td class="px-3 py-3">
                      <span
                        class="inline-flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-semibold"
                        :class="rule.enabled
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : 'border-stroke-subtle/70 bg-background-mute text-content-muted dark:border-stroke/20 dark:bg-white/5 dark:text-content-muted'"
                        :title="rule.enabled ? 'Enabled' : 'Disabled'"
                      >
                        {{ rule.enabled ? '✓' : '—' }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-content-primary">
                      <span class="block truncate font-medium" :title="rule.name">{{ rule.name }}</span>
                    </td>
                    <td class="px-3 py-3 text-xs text-content-secondary">
                      <span class="block truncate font-mono leading-5" :title="summarizeRule(rule)">{{ summarizeRule(rule) }}</span>
                    </td>
                    <td class="px-3 py-3">
                      <span
                        class="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide"
                        :class="actionBadgeClasses(rule.action)"
                        :title="rule.action"
                      >
                        {{ actionLabel(rule.action) }}
                      </span>
                    </td>
                    <td class="px-3 py-3 text-right">
                      <div class="inline-flex flex-wrap items-center justify-end gap-1">
                        <button class="cfg-btn-secondary text-xs px-2 py-1" :disabled="!isEditing || saving" @click="moveRule(idx, -1)">▲</button>
                        <button class="cfg-btn-secondary text-xs px-2 py-1" :disabled="!isEditing || saving" @click="moveRule(idx, 1)">▼</button>
                        <button class="cfg-btn-secondary text-xs px-2 py-1" :disabled="!isEditing || saving" @click="openEditRuleModal(idx)">Edit</button>
                        <button class="text-xs px-2 py-1 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40" :disabled="!isEditing || saving" @click="removeRule(idx)">Del</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!uiRules.length">
                    <td colspan="6" class="px-3 py-8 text-center text-xs text-content-muted">No rules yet. Add your first rule.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p class="text-xs text-content-muted">
              Rules are evaluated top to bottom. First matching rule wins.
            </p>

            <div v-if="useAdvancedJson" class="space-y-2">
              <label class="cfg-label">Advanced JSON Editor</label>
              <textarea
                v-model="rulesJson"
                rows="12"
                spellcheck="false"
                :disabled="!isEditing || saving"
                class="cfg-textarea font-mono text-xs"
                placeholder='[{"id":1,"if":{"all":[{"field":"hop_count","op":"greater_than","value":4}]},"then":{"action":"drop"}}]'
              />
              <div class="flex justify-end">
                <button class="cfg-btn-secondary text-xs" :disabled="!isEditing || saving" @click="syncUiFromRulesJson">Apply JSON To Table</button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 justify-end">
            <button class="cfg-btn-secondary" :disabled="saving || !isEditing" @click="validatePolicy">Validate</button>
          </div>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div class="cfg-section">
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs sm:text-sm rounded-md border transition-colors"
              :class="objectKind === 'channel_hashes'
                ? 'border-primary/60 text-primary bg-primary/10'
                : 'border-stroke-subtle dark:border-stroke/30 text-content-secondary dark:text-content-muted'"
              @click="objectKind = 'channel_hashes'"
            >
              Channel Hash Groups
            </button>
            <button
              class="px-3 py-1.5 text-xs sm:text-sm rounded-md border transition-colors"
              :class="objectKind === 'pubkeys'
                ? 'border-primary/60 text-primary bg-primary/10'
                : 'border-stroke-subtle dark:border-stroke/30 text-content-secondary dark:text-content-muted'"
              @click="objectKind = 'pubkeys'"
            >
              Pubkey Groups
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div class="cfg-section lg:col-span-4 space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-content-primary">Groups</h4>
              <span class="text-xs text-content-muted">{{ currentGroups.length }} total</span>
            </div>

            <div class="space-y-2 max-h-[360px] overflow-auto pr-1">
              <button
                v-for="group in currentGroups"
                :key="group.id"
                class="w-full text-left rounded-lg border p-3 transition-colors"
                :class="selectedGroupId === group.id
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-stroke-subtle dark:border-stroke/20 bg-background-mute dark:bg-white/5 hover:bg-stroke-subtle dark:hover:bg-white/10'"
                @click="selectedGroupId = group.id"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-medium text-content-primary">
                      {{ group.friendly_name }}
                    </p>
                    <p class="text-xs text-content-muted mt-1">{{ group.id }}</p>
                  </div>
                  <span class="text-[11px] text-content-muted">{{ group.entries.length }}</span>
                </div>
              </button>

              <div v-if="!currentGroups.length" class="text-xs text-content-muted py-8 text-center border border-dashed border-stroke-subtle dark:border-stroke/30 rounded-lg">
                No groups yet
              </div>
            </div>

            <div class="pt-2 border-t border-stroke-subtle dark:border-stroke/20 space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-content-muted">Create Group</h5>
              <input v-model="newGroup.friendly_name" class="cfg-input" :disabled="!isEditing || saving" placeholder="Friendly name" />
              <input v-model="newGroup.description" class="cfg-input" :disabled="!isEditing || saving" placeholder="Description (optional)" />
              <button class="cfg-btn-primary w-full" :disabled="!isEditing || saving" @click="createGroup">Add Group</button>
            </div>
          </div>

          <div class="cfg-section lg:col-span-8 space-y-4">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-semibold text-content-primary">
                {{ selectedGroup ? selectedGroup.friendly_name : 'Entries' }}
              </h4>
              <button
                v-if="selectedGroup"
                class="text-xs px-2.5 py-1 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                :disabled="!isEditing || saving"
                @click="deleteGroup(selectedGroup.id)"
              >
                Delete Group
              </button>
            </div>

            <div v-if="selectedGroup" class="overflow-x-auto rounded-lg border border-stroke-subtle dark:border-stroke/20">
              <table class="w-full text-sm">
                <thead class="bg-background-mute dark:bg-white/5">
                  <tr>
                    <th class="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Name</th>
                    <th class="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Value</th>
                    <th class="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wide text-content-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="entry in selectedGroup.entries" :key="entry.id" class="border-t border-stroke-subtle dark:border-stroke/15">
                    <td class="px-3 py-2 text-content-primary">{{ entry.friendly_name }}</td>
                    <td class="px-3 py-2 font-mono text-xs text-content-secondary">{{ entry.value }}</td>
                    <td class="px-3 py-2 text-right">
                      <button
                        class="text-xs px-2.5 py-1 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        :disabled="!isEditing || saving"
                        @click="removeEntry(entry.id)"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!selectedGroup.entries.length">
                    <td colspan="3" class="px-3 py-8 text-center text-xs text-content-muted">No entries in this group</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="text-xs text-content-muted py-8 text-center border border-dashed border-stroke-subtle dark:border-stroke/30 rounded-lg">
              Select a group to manage entries
            </div>

            <div class="pt-2 border-t border-stroke-subtle dark:border-stroke/20 space-y-2" v-if="selectedGroup">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-content-muted">Add Entry</h5>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input v-model="newEntry.friendly_name" class="cfg-input" :disabled="!isEditing || saving" placeholder="Friendly name" />
                <input
                  v-model="newEntry.value"
                  class="cfg-input font-mono"
                  :disabled="!isEditing || saving"
                  :placeholder="objectKind === 'channel_hashes' ? '0x...' : '0xaabbccdd'"
                />
              </div>
              <button class="cfg-btn-primary" :disabled="!isEditing || saving" @click="addEntry">Add Entry</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="showRuleModal && ruleDraft"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="closeRuleModal"
    >
      <div class="bg-surface dark:bg-surface-elevated border border-stroke-subtle dark:border-stroke/20 rounded-[15px] p-5 max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-content-primary">
              {{ editingRuleIndex === null ? 'Add Policy Rule' : 'Edit Policy Rule' }}
            </h3>
            <p class="text-xs text-content-muted mt-1">
              Choose match logic, then add one or more conditions. {{ ruleDraft.matchMode === 'all' ? 'ALL' : 'ANY' }} conditions must match.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="w-7 h-7 rounded-full border border-stroke-subtle dark:border-stroke/30 text-content-secondary dark:text-content-muted hover:text-content-primary dark:hover:text-content-primary hover:bg-background-mute dark:hover:bg-white/10 text-sm font-semibold"
              :class="showLogicMatrix ? 'bg-primary/10 text-primary border-primary/50' : ''"
              title="Match Field Logic Matrix"
              @click="showLogicMatrix = !showLogicMatrix"
            >
              i
            </button>
            <button class="cfg-btn-secondary text-xs" @click="closeRuleModal">Close</button>
          </div>
        </div>

        <div
          v-if="showLogicMatrix"
          class="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2"
        >
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-content-primary">Match Field Logic Matrix</h4>
            <button class="cfg-btn-secondary text-xs" @click="showLogicMatrix = false">Hide</button>
          </div>
          <div class="overflow-x-auto rounded-lg border border-stroke-subtle dark:border-stroke/20">
            <table class="w-full min-w-[840px] text-xs">
              <thead class="bg-background-mute dark:bg-white/5">
                <tr>
                  <th class="px-2 py-2 text-left font-semibold uppercase tracking-wide text-content-muted">Field</th>
                  <th class="px-2 py-2 text-left font-semibold uppercase tracking-wide text-content-muted">Value Types</th>
                  <th class="px-2 py-2 text-left font-semibold uppercase tracking-wide text-content-muted">Operators</th>
                  <th class="px-2 py-2 text-left font-semibold uppercase tracking-wide text-content-muted">Group Sources</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in fieldDefinitions" :key="f.value" class="border-t border-stroke-subtle dark:border-stroke/15">
                  <td class="px-2 py-1.5">{{ f.label }}</td>
                  <td class="px-2 py-1.5">{{ f.valueTypes.join(', ') }}</td>
                  <td class="px-2 py-1.5">{{ f.operators.map(operatorLabel).join(', ') }}</td>
                  <td class="px-2 py-1.5">{{ f.groupKinds?.join(', ') || 'None' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="ruleModalError" class="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-red-600 dark:text-red-400 text-xs">
          {{ ruleModalError }}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="md:col-span-2">
            <label class="cfg-label">Rule Name</label>
            <input v-model="ruleDraft.name" class="cfg-input mt-1" placeholder="Block noisy channel route" />
          </div>
          <div>
            <label class="cfg-label">Match Logic</label>
            <select v-model="ruleDraft.matchMode" class="cfg-select mt-1">
              <option value="all">ALL conditions (AND)</option>
              <option value="any">ANY condition (OR)</option>
            </select>
          </div>
          <div>
            <label class="cfg-label">Action</label>
            <select v-model="ruleDraft.action" class="cfg-select mt-1">
              <option v-for="opt in actionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <label class="inline-flex items-center gap-2 text-sm text-content-primary">
          <input v-model="ruleDraft.enabled" type="checkbox" />
          Rule enabled
        </label>

        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-semibold text-content-primary">Conditions</h4>
            <button class="cfg-btn-secondary text-xs" @click="addDraftCondition">Add Condition</button>
          </div>

          <div
            v-if="getChannelBodyGuardWarning(ruleDraft)"
            class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          >
            {{ getChannelBodyGuardWarning(ruleDraft) }}
          </div>

          <div class="overflow-x-auto rounded-lg border border-stroke-subtle dark:border-stroke/20">
            <table class="w-full min-w-[980px] text-sm">
              <thead class="bg-background-mute dark:bg-white/5">
                <tr>
                  <th class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Drag</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Field</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Operator</th>
                  <th v-if="hasAnyGroupSource" class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Source</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Value</th>
                  <th class="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-content-muted">Type</th>
                  <th class="px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-content-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(cond, cIdx) in ruleDraft.conditions"
                  :key="cond.id"
                  class="border-t border-stroke-subtle dark:border-stroke/15 transition-colors"
                  :class="{
                    'opacity-60': draggingConditionIndex === cIdx,
                    '!border-t-2 !border-primary': dropInsertIndex === cIdx && draggingConditionIndex !== null,
                  }"
                  @dragover="onConditionDragOver(cIdx, $event)"
                  @drop="onConditionDrop($event)"
                >
                  <td class="px-2 py-2 w-[58px]">
                    <button
                      type="button"
                      draggable="true"
                      class="h-8 w-8 inline-flex items-center justify-center rounded border border-stroke-subtle dark:border-stroke/20 text-content-secondary dark:text-content-muted hover:bg-background-mute dark:hover:bg-white/10 cursor-grab active:cursor-grabbing"
                      title="Drag to reorder"
                      @dragstart="onConditionDragStart(cIdx, $event)"
                      @dragend="onConditionDragEnd"
                    >
                      ☰
                    </button>
                  </td>
                  <td class="px-2 py-2 min-w-[170px]">
                    <select v-model="cond.field" class="cfg-select h-8 text-xs" @change="onDraftConditionFieldChange(cond)">
                      <option v-for="f in fieldDefinitions" :key="f.value" :value="f.value">{{ f.label }}</option>
                    </select>
                  </td>
                  <td class="px-2 py-2 min-w-[160px]">
                    <select v-model="cond.op" class="cfg-select h-8 text-xs">
                      <option v-for="op in getAllowedOperators(cond.field)" :key="op" :value="op">{{ operatorLabel(op) }}</option>
                    </select>
                  </td>
                  <td v-if="hasAnyGroupSource" class="px-2 py-2 min-w-[140px]">
                    <select v-model="cond.valueSource" class="cfg-select h-8 text-xs" :disabled="!supportsGroupSource(cond.field)">
                      <option value="literal">Literal</option>
                      <option v-if="supportsGroupSource(cond.field)" value="group">Group</option>
                    </select>
                  </td>
                  <td class="px-2 py-2 min-w-[230px]">
                    <template v-if="hasAnyGroupSource && cond.valueSource === 'group' && supportsGroupSource(cond.field)">
                      <div class="grid grid-cols-2 gap-1">
                        <select v-model="cond.groupKind" class="cfg-select h-8 text-xs">
                          <option v-for="kind in getAllowedGroupKinds(cond.field)" :key="kind" :value="kind">{{ kind }}</option>
                        </select>
                        <select v-model="cond.groupId" class="cfg-select h-8 text-xs">
                          <option v-for="g in getGroupsByKind(cond.groupKind)" :key="g.id" :value="g.id">{{ g.friendly_name }}</option>
                        </select>
                      </div>
                    </template>
                    <div v-else class="space-y-1">
                      <select
                        v-if="getLiteralLookupOptions(cond).length"
                        class="cfg-select h-8 text-xs"
                        @change="applyLookupValue(cond, String(($event.target as HTMLSelectElement).value))"
                      >
                        <option value="">Lookup value...</option>
                        <option
                          v-for="opt in getLiteralLookupOptions(cond)"
                          :key="`${cond.id}-${opt.value}`"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                      <textarea
                        v-if="useMultilineLiteralInput(cond)"
                        v-model="cond.value"
                        class="cfg-input min-h-[72px] text-xs font-mono py-2"
                        :placeholder="getLiteralPlaceholder(cond)"
                      />
                      <input
                        v-else
                        v-model="cond.value"
                        class="cfg-input h-8 text-xs font-mono"
                        :placeholder="getLiteralPlaceholder(cond)"
                      />
                      <p v-if="isPathHashesField(cond.field)" class="text-[11px] text-slate-500 dark:text-slate-400">
                        Use hex only. All hashes in one condition must be the same width: 1 byte (`0x42`), 2 bytes (`0x0042`), or 3 bytes (`0x000042`).
                      </p>
                    </div>
                  </td>
                  <td class="px-2 py-2 min-w-[110px]">
                    <select v-model="cond.valueType" class="cfg-select h-8 text-xs" :disabled="hasAnyGroupSource && cond.valueSource === 'group'">
                      <option v-for="vt in getAllowedValueTypes(cond.field)" :key="vt" :value="vt">{{ vt }}</option>
                    </select>
                  </td>
                  <td class="px-2 py-2 text-right">
                    <div class="inline-flex items-center gap-1">
                      <button
                        class="text-xs px-2 py-1 rounded border border-stroke-subtle dark:border-stroke/20 text-content-secondary dark:text-content-muted hover:bg-background-mute dark:hover:bg-white/10 disabled:opacity-40"
                        :disabled="cIdx === 0"
                        title="Move condition up"
                        aria-label="Move condition up"
                        @click="moveDraftCondition(cIdx, -1)"
                      >
                        ▲
                      </button>
                      <button
                        class="text-xs px-2 py-1 rounded border border-stroke-subtle dark:border-stroke/20 text-content-secondary dark:text-content-muted hover:bg-background-mute dark:hover:bg-white/10 disabled:opacity-40"
                        :disabled="cIdx === ruleDraft.conditions.length - 1"
                        title="Move condition down"
                        aria-label="Move condition down"
                        @click="moveDraftCondition(cIdx, 1)"
                      >
                        ▼
                      </button>
                      <button class="text-xs px-2 py-1 rounded border border-red-500/50 text-red-600 dark:text-red-400 hover:bg-red-500/10" @click="removeDraftCondition(cIdx)">Del</button>
                    </div>
                  </td>
                </tr>
                <tr
                  v-if="draggingConditionIndex !== null && dropInsertIndex === ruleDraft.conditions.length"
                  class="border-t-2 border-primary"
                  @dragover.prevent
                  @drop="onConditionDrop($event)"
                >
                  <td :colspan="conditionTableColspan" class="px-2 py-0">
                    <div class="h-0" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button class="cfg-btn-secondary" @click="closeRuleModal">Cancel</button>
          <button class="cfg-btn-primary" @click="saveRuleModal">Save Rule</button>
        </div>
      </div>
    </div>
  </div>
</template>
