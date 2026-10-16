/**
 * Escape a value for safe interpolation into an HTML string.
 *
 * Leaflet popups and divIcons take HTML, so anything we interpolate into them
 * must be escaped. Neighbor names, contact types and similar fields arrive
 * from the mesh in packets anyone can send, so they must never be trusted.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
