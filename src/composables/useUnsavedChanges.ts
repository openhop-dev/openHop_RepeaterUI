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

  onBeforeRouteLeave((_to, _from, next) => {
    if (isEditing.value) {
      showUnsavedModal.value = true;
      pendingNavFn.value = () => next();
      pendingCancelFn.value = () => next(false);
    } else {
      next();
    }
  });

  function requestLeave(callback: () => void) {
    if (isEditing.value) {
      showUnsavedModal.value = true;
      pendingNavFn.value = callback;
      pendingCancelFn.value = null;
    } else {
      callback();
    }
  }

  function handleDiscard() {
    cancelFn();
    showUnsavedModal.value = false;
    pendingCancelFn.value = null;
    if (pendingNavFn.value) { pendingNavFn.value(); pendingNavFn.value = null; }
  }

  async function handleSave() {
    const ok = await saveFn();
    if (ok) {
      showUnsavedModal.value = false;
      pendingCancelFn.value = null;
      if (pendingNavFn.value) { pendingNavFn.value(); pendingNavFn.value = null; }
    }
  }

  function handleCancel() {
    showUnsavedModal.value = false;
    if (pendingCancelFn.value) { pendingCancelFn.value(); pendingCancelFn.value = null; }
    pendingNavFn.value = null;
  }

  return { showUnsavedModal, requestLeave, handleDiscard, handleSave, handleCancel };
}
