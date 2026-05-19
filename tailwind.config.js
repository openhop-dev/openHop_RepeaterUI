/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  // safelist: height classes used by BAR_HEIGHTS_SM / BAR_HEIGHTS_MD lookup arrays in
  // NeighborTable.vue and NeighborDetailsModal.vue — composed dynamically so JIT can't scan them.
  safelist: ['h-1.5', 'h-2', 'h-2.5', 'h-3', 'h-3.5', 'h-4'],
  theme: {
    extend: {
      colors: {
        // Semantic colors from CSS variables (auto-switch light/dark)
        surface: {
          DEFAULT: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
        },
        background: {
          DEFAULT: 'var(--color-background)',
          soft: 'var(--color-background-soft)',
          mute: 'var(--color-background-mute)',
        },
        content: {
          DEFAULT: 'var(--color-text)',
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          heading: 'var(--color-heading)',
        },
        stroke: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          hover: 'var(--color-border-hover)',
        },
        // Accent colors (text/icon use - auto-switch)
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: {
          green: 'var(--color-accent-green)',
          purple: 'var(--color-accent-purple)',
          red: 'var(--color-accent-red)',
          cyan: 'var(--color-accent-cyan)',
        },
        // Accent backgrounds (for fills with text on top)
        'primary-bg': 'var(--color-primary-bg)',
        'secondary-bg': 'var(--color-secondary-bg)',
        'accent-bg': {
          green: 'var(--color-accent-green-bg)',
          purple: 'var(--color-accent-purple-bg)',
          red: 'var(--color-accent-red-bg)',
          cyan: 'var(--color-accent-cyan-bg)',
        },
        // Badge colors (auto-invert between light/dark modes)
        badge: {
          'cyan-bg': 'var(--color-badge-cyan-bg)',
          'cyan-text': 'var(--color-badge-cyan-text)',
          'neutral-bg': 'var(--color-badge-neutral-bg)',
          'neutral-text': 'var(--color-badge-neutral-text)',
        },
        // Legacy mappings (for backward compatibility during migration)
        light: {
          bg: 'var(--color-background)',
          card: 'var(--color-surface)',
          sidebar: 'var(--color-surface)',
          section: 'var(--color-background-mute)',
          border: 'var(--color-border)',
          text: 'var(--color-text-secondary)',
        },
        dark: {
          bg: 'var(--color-background)',
          card: 'var(--color-surface)',
          sidebar: 'var(--color-surface)',
          section: 'var(--color-background-mute)',
          border: 'var(--color-border)',
          text: 'var(--color-text-muted)',
        },
      },
      fontFamily: {
        sans: ['Noto Sans', '-apple-system', 'Roboto', 'Helvetica', 'sans-serif'],
      },
      backdropBlur: {
        '50': '50px',
      },
    },
  },
  plugins: [],
}
