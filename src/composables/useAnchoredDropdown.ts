import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Manages a Teleported dropdown panel anchored to a trigger button.
 * Panel is right-aligned to the trigger and positioned 4px below it.
 * Use `fixed` + `:style="panelStyle"` on the panel element.
 *
 * Click-outside is handled automatically. Do NOT add @click.stop to the wrapper —
 * propagation must reach the document so opening one dropdown closes others.
 */
export function useAnchoredDropdown() {
  const triggerRef = ref<HTMLElement | null>(null)
  const wrapperRef = ref<HTMLElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const isOpen = ref(false)
  const panelStyle = ref<Record<string, string>>({ top: '0px', right: '0px' })

  // DashboardLayout's <main> is the scroll container — window.scrollY is always 0 in this app.
  const scrollContainer = () => document.querySelector('main')

  function updatePosition() {
    if (!triggerRef.value) return
    const rect = triggerRef.value.getBoundingClientRect()
    if (window.innerWidth < 640) {
      panelStyle.value = {
        top: `${rect.bottom + 4}px`,
        left: '50%',
        right: 'auto',
        transform: 'translateX(-50%)',
      }
    } else {
      panelStyle.value = {
        top: `${rect.bottom + 4}px`,
        right: `${window.innerWidth - rect.right}px`,
        left: 'auto',
        transform: 'none',
      }
    }
  }

  function open() {
    scrollContainer()?.addEventListener('scroll', updatePosition, { passive: true })
    updatePosition()
    isOpen.value = true
  }

  function close() {
    scrollContainer()?.removeEventListener('scroll', updatePosition)
    isOpen.value = false
  }

  function toggle() {
    isOpen.value ? close() : open()
  }

  function onDocumentClick(e: MouseEvent) {
    const target = e.target as Node
    const inWrapper = wrapperRef.value?.contains(target) ?? false
    const inPanel = panelRef.value?.contains(target) ?? false
    if (!inWrapper && !inPanel) close()
  }

  onMounted(() => document.addEventListener('click', onDocumentClick))
  onUnmounted(() => {
    document.removeEventListener('click', onDocumentClick)
    scrollContainer()?.removeEventListener('scroll', updatePosition)
  })

  return { triggerRef, wrapperRef, panelRef, isOpen, panelStyle, open, close, toggle }
}
