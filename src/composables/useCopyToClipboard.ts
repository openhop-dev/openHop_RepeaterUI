import { ref } from 'vue'

export function useCopyToClipboard(resetMs = 2000) {
  const copied = ref(false)

  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    copied.value = true
    setTimeout(() => { copied.value = false }, resetMs)
  }

  return { copy, copied }
}
