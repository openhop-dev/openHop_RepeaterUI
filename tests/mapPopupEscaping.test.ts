import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guardrail: every place a neighbor-supplied field is interpolated into
 * Leaflet HTML (bindPopup / divIcon html) must go through escapeHtml().
 * A node name is set by whoever sent the advert, so an unescaped one is a
 * stored XSS against the operator viewing the map.
 */
const FILES = [
  'src/components/neighbors/NetworkMap.vue',
  'src/components/modals/NeighborDetailsModal.vue',
];

// Fields that originate in over-the-air packets.
const UNTRUSTED_FIELDS = ['node_name', 'contact_type'];

const INTERPOLATION = /\$\{[^}]*\}/g;

describe('map popup HTML escaping', () => {
  it.each(FILES)('%s escapes every untrusted field it interpolates', (file) => {
    const src = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(src).toContain("from '@/utils/escapeHtml'");
    const unescaped = (src.match(INTERPOLATION) ?? []).filter(
      (expr) =>
        UNTRUSTED_FIELDS.some((field) => expr.includes(field)) &&
        !expr.startsWith('${escapeHtml('),
    );
    expect(unescaped).toEqual([]);
  });

  it('fails when an interpolation is left unescaped', () => {
    const sample = '`<b>${advert.node_name}</b> ${escapeHtml(advert.contact_type)}`';
    const unescaped = (sample.match(INTERPOLATION) ?? []).filter(
      (expr) =>
        UNTRUSTED_FIELDS.some((field) => expr.includes(field)) &&
        !expr.startsWith('${escapeHtml('),
    );
    expect(unescaped).toEqual(['${advert.node_name}']);
  });
});
