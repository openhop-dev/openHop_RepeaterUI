import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/utils/escapeHtml';

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });

  it('leaves ordinary node names alone', () => {
    expect(escapeHtml('KB6CIO Hilltop 2')).toBe('KB6CIO Hilltop 2');
    expect(escapeHtml('Café ☕ 🛰')).toBe('Café ☕ 🛰');
  });

  it('renders null and undefined as empty strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('stringifies non-string values', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
