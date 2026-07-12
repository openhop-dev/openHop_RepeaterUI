import { ref, readonly } from 'vue'
import { getPreference, setPreference, removePreference } from '@/utils/preferences'

const PREF_PIN     = 'sidebar-pin-enabled'
const PREF_FOLDS   = 'sidebar-fold-state'

// ── Singleton state (shared across all NavItem instances) ─────────────────────

const isPinned = ref<boolean>(getPreference<boolean>(PREF_PIN, false))
const foldState = ref<Record<string, boolean>>(
  isPinned.value ? getPreference<Record<string, boolean>>(PREF_FOLDS, {}) : {},
)

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Toggle the pin on or off.
 * - Turning ON: persists isPinned; the next recordFold call will start saving state.
 * - Turning OFF: clears saved fold state from storage and resets the in-memory
 *   map. The menu is left visually as-is — NavItem expanded refs are not touched.
 */
function togglePin(): void {
  isPinned.value = !isPinned.value
  setPreference(PREF_PIN, isPinned.value)

  if (!isPinned.value) {
    foldState.value = {}
    removePreference(PREF_FOLDS)
  }
}

/**
 * Called by NavItem whenever a group's expanded state changes.
 * Only writes to storage when the pin is active.
 */
function recordFold(id: string, expanded: boolean): void {
  if (!isPinned.value) return
  foldState.value = { ...foldState.value, [id]: expanded }
  setPreference(PREF_FOLDS, foldState.value)
}

/**
 * Returns the persisted expanded state for a group id, or null if the pin is
 * off or no state has been saved for that id yet.
 */
function getRestoredFold(id: string): boolean | null {
  if (!isPinned.value) return null
  const saved = foldState.value[id]
  return saved !== undefined ? saved : null
}

export function useSidebarPin() {
  return {
    isPinned: readonly(isPinned),
    togglePin,
    recordFold,
    getRestoredFold,
  }
}
