import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

async function loadTheme() {
  vi.resetModules();
  return import('@/composables/useTheme');
}

describe('useTheme', () => {
  beforeEach(() => {
    clearCookies();
    localStorage.clear();
    document.documentElement.className = '';
    delete document.documentElement.dataset.theme;
  });

  it('restores the theme from the cookie', async () => {
    document.cookie = 'openhop_theme=hacker; path=/';
    const { useTheme } = await loadTheme();
    const { themeId, theme } = useTheme();
    expect(themeId.value).toBe('hacker');
    expect(theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('hacker');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores an unknown cookie value', async () => {
    document.cookie = 'openhop_theme=%3Cscript%3E; path=/';
    localStorage.setItem('theme-preference', 'light');
    const { useTheme } = await loadTheme();
    expect(useTheme().themeId.value).toBe('light');
  });

  it('saves the selected theme to a cookie', async () => {
    const { useTheme } = await loadTheme();
    const { setTheme } = useTheme();
    setTheme('light');
    await nextTick();
    expect(document.cookie).toContain('openhop_theme=light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('toggles from a dark custom theme to light', async () => {
    document.cookie = 'openhop_theme=hacker; path=/';
    const { useTheme } = await loadTheme();
    const { toggleTheme, themeId } = useTheme();
    toggleTheme();
    expect(themeId.value).toBe('light');
  });
});

describe('AppearanceSettings', () => {
  it('switches theme when an option is clicked', async () => {
    const { useTheme } = await loadTheme();
    const { default: AppearanceSettings } = await import(
      '@/components/configuration/AppearanceSettings.vue'
    );
    const wrapper = mount(AppearanceSettings);
    await wrapper.find('[data-theme-option="hacker"]').trigger('click');
    expect(useTheme().themeId.value).toBe('hacker');
    expect(
      wrapper.find('[data-theme-option="hacker"]').attributes('aria-checked'),
    ).toBe('true');
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    clearCookies();
  });

  async function mountToggle() {
    const { default: ThemeToggle } = await import('@/components/ThemeToggle.vue');
    return mount(ThemeToggle);
  }

  it('shows the light/dark toggle for the base themes', async () => {
    document.cookie = 'openhop_theme=light; path=/';
    await loadTheme();
    expect((await mountToggle()).find('button').exists()).toBe(true);
  });

  it('hides the light/dark toggle while a custom theme is active', async () => {
    document.cookie = 'openhop_theme=dracula; path=/';
    await loadTheme();
    expect((await mountToggle()).find('button').exists()).toBe(false);
  });
});

describe('theme registry', () => {
  it('imports a stylesheet for every custom theme', async () => {
    const { THEMES, BASE_THEME_IDS } = await import('@/themes');
    const css = readFileSync(resolve(process.cwd(), 'src/themes/index.css'), 'utf8');
    for (const { id } of THEMES) {
      if (BASE_THEME_IDS.includes(id)) continue;
      expect(css).toContain(`@import './${id}.css';`);
    }
  });
});
