/**
 * Theme registry. To add a theme: create `src/themes/<id>.css` overriding the
 * design tokens under `html[data-theme='<id>']`, import it in
 * `src/themes/index.css`, and add an entry below.
 */
export type ThemeMode = 'light' | 'dark';

export interface ThemePreview {
  background: string;
  surface: string;
  border: string;
  accent: string;
  text: string;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  /** Base palette the theme builds on; drives the `.dark` class and `dark:` utilities. */
  mode: ThemeMode;
  preview: ThemePreview;
}

export const THEMES = [
  {
    id: 'light',
    label: 'Light',
    mode: 'light',
    preview: { background: '#f6f8ff', surface: '#ffffff', border: '#cbd5e1', accent: '#3b82f6', text: '#0f172a' },
  },
  {
    id: 'dark',
    label: 'Dark',
    mode: 'dark',
    preview: { background: '#05070d', surface: '#0d121f', border: '#1f2937', accent: '#60a5fa', text: '#f8fafc' },
  },
  {
    id: 'amoled',
    label: 'AMOLED',
    mode: 'dark',
    preview: { background: '#000000', surface: '#111111', border: '#262626', accent: '#ffffff', text: '#ffffff' },
  },
  {
    id: 'hacker',
    label: 'Hacker',
    mode: 'dark',
    preview: { background: '#000000', surface: '#030d05', border: '#073a14', accent: '#39ff14', text: '#00ff41' },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    mode: 'dark',
    preview: { background: '#0b1026', surface: '#1a2445', border: '#1e2a52', accent: '#5b7cfa', text: '#e0e7ff' },
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    mode: 'dark',
    preview: { background: '#14091f', surface: '#2a1238', border: '#3a1a4d', accent: '#ff2fb4', text: '#f5e9ff' },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    mode: 'dark',
    preview: { background: '#282a36', surface: '#343746', border: '#44475a', accent: '#bd93f9', text: '#f8f8f2' },
  },
  {
    id: 'nord',
    label: 'Nord',
    mode: 'dark',
    preview: { background: '#2e3440', surface: '#3b4252', border: '#4c566a', accent: '#88c0d0', text: '#eceff4' },
  },
  {
    id: 'forest',
    label: 'Forest',
    mode: 'dark',
    preview: { background: '#1a2b20', surface: '#2a4534', border: '#36553f', accent: '#a3d9a5', text: '#e8f3e8' },
  },
  {
    id: 'synthwave',
    label: 'Synthwave',
    mode: 'dark',
    preview: { background: '#2b1854', surface: '#3d2468', border: '#4a2d7a', accent: '#ff8a65', text: '#ffffff' },
  },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = (typeof THEMES)[number]['id'];

/** The built-in light/dark pair the top-bar toggle switches between. */
export const BASE_THEME_IDS: readonly ThemeId[] = ['light', 'dark'];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value);
}

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return THEMES.find((t) => t.id === id) ?? THEMES[1];
}
