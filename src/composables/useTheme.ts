import { computed, ref, watch } from 'vue';
import {
  BASE_THEME_IDS,
  THEMES,
  getThemeDefinition,
  isThemeId,
  type ThemeId,
  type ThemeMode,
} from '@/themes';
import { getCookie, setCookie } from '@/utils/cookies';

/** Light/dark mode of the active theme. */
export type Theme = ThemeMode;
export type { ThemeId };

export const THEME_COOKIE = 'openhop_theme';
const LEGACY_STORAGE_KEY = 'theme-preference';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const themeId = ref<ThemeId>('dark');
const theme = computed<Theme>(() => getThemeDefinition(themeId.value).mode);
const isCustomTheme = computed(() => !BASE_THEME_IDS.includes(themeId.value));

function applyTheme(id: ThemeId) {
  const html = document.documentElement;
  html.classList.toggle('dark', getThemeDefinition(id).mode === 'dark');
  html.dataset.theme = id;
}

function readStoredTheme(): ThemeId | null {
  const fromCookie = getCookie(THEME_COOKIE);
  if (isThemeId(fromCookie)) return fromCookie;
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (isThemeId(legacy)) return legacy;
  } catch {
    // Storage can be unavailable (privacy mode); fall through to the system preference.
  }
  return null;
}

export function initTheme() {
  const stored = readStoredTheme();
  if (stored) {
    themeId.value = stored;
  } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    themeId.value = 'light';
  } else {
    themeId.value = 'dark';
  }
  applyTheme(themeId.value);
}

if (typeof window !== 'undefined') {
  initTheme();
}

watch(themeId, (id) => {
  setCookie(THEME_COOKIE, id, COOKIE_MAX_AGE);
  applyTheme(id);
});

export function useTheme() {
  const toggleTheme = () => {
    themeId.value = theme.value === 'dark' ? 'light' : 'dark';
  };

  const setTheme = (id: ThemeId) => {
    if (isThemeId(id)) themeId.value = id;
  };

  const isDark = () => theme.value === 'dark';

  return {
    theme,
    themeId,
    themes: THEMES,
    isCustomTheme,
    toggleTheme,
    setTheme,
    isDark,
  };
}
