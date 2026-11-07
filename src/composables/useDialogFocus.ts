import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens,
 * Tab stays inside it, Escape calls `onEscape`, and focus returns to what was
 * focused before it opened.
 *
 * `initialFocus` names the element to focus first; otherwise the first
 * focusable element in `container` is used. When the element to return to
 * is gone or disabled by then (the action disabled its row, say),
 * `onFocusLost` is called instead, so focus is not dropped on the body.
 */
export function useDialogFocus(
  open: Ref<boolean>,
  container: Ref<HTMLElement | null>,
  onEscape: () => void,
  initialFocus?: Ref<HTMLElement | null>,
  onFocusLost?: (lost: HTMLElement | null) => void,
) {
  let returnTo: HTMLElement | null = null;

  function focusables(): HTMLElement[] {
    return Array.from(container.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
  }

  function onKeydown(event: KeyboardEvent) {
    if (!open.value) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    const outside = !container.value?.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  watch(
    open,
    async (isOpen) => {
      if (isOpen) {
        returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.addEventListener('keydown', onKeydown);
        await nextTick();
        (initialFocus?.value ?? focusables()[0])?.focus();
      } else {
        document.removeEventListener('keydown', onKeydown);
        const target = returnTo;
        returnTo = null;
        // Let the re-render the closing action caused settle first.
        await nextTick();
        if (target?.isConnected && !target.matches(':disabled')) target.focus();
        else onFocusLost?.(target);
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
