import { ref, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

export function useUnsavedChanges(
  isEditing: Ref<boolean>,
  isSaving: Ref<boolean>,
  cancelFn: () => void,
  saveFn: () => Promise<boolean>,
) {
  const showUnsavedModal = ref(false);
  const pendingNavFn = ref<(() => void) | null>(null);
  const pendingCancelFn = ref<(() => void) | null>(null);

  function queueLeave(continueNavigation: () => void, cancelNavigation?: () => void) {
    // Resolve the previous guard before replacing it, or its router.push stays pending.
    pendingCancelFn.value?.();
    pendingNavFn.value = continueNavigation;
    pendingCancelFn.value = cancelNavigation ?? null;
    showUnsavedModal.value = true;
  }

  onBeforeRouteLeave((_to, _from, next) => {
    if (isEditing.value) {
      queueLeave(
        () => next(),
        () => next(false),
      );
    } else {
      next();
    }
  });

  function requestLeave(callback: () => void, cancel?: () => void) {
    if (isEditing.value) {
      queueLeave(callback, cancel);
    } else {
      callback();
    }
  }

  function handleDiscard() {
    cancelFn();
    showUnsavedModal.value = false;
    pendingCancelFn.value = null;
    if (pendingNavFn.value) {
      pendingNavFn.value();
      pendingNavFn.value = null;
    }
  }

  async function handleSave() {
    const ok = await saveFn();
    if (ok) {
      showUnsavedModal.value = false;
      pendingCancelFn.value = null;
      if (pendingNavFn.value) {
        pendingNavFn.value();
        pendingNavFn.value = null;
      }
    }
  }

  function handleCancel() {
    showUnsavedModal.value = false;
    if (pendingCancelFn.value) {
      pendingCancelFn.value();
      pendingCancelFn.value = null;
    }
    pendingNavFn.value = null;
  }

  return { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel };
}
