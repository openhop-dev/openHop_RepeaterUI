/**
 * The save bar and the change list behind it: a settings page lists what
 * differs from what it loaded, and the bar offers Discard / Save for all of it.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SaveBar from '@/components/ui/SaveBar.vue';
import { diffChanges, formatChangeValue } from '@/utils/changeSet';

describe('diffChanges', () => {
  it('reports nothing for equal values, including undefined against missing', () => {
    expect(diffChanges({ a: 1, b: { c: 'x' } }, { a: 1, b: { c: 'x' } })).toEqual([]);
    expect(diffChanges({ a: 1, b: undefined }, { a: 1 })).toEqual([]);
  });

  it('lists changed leaves by dotted path', () => {
    const before = { radio_type: 'modem_tcp', modem_tcp: { host: 'g2', port: 5055 } };
    const after = { radio_type: 'modem_tcp', modem_tcp: { host: 'g2', port: 5056 } };
    expect(diffChanges(before, after)).toEqual([
      { path: 'modem_tcp.port', from: 5055, to: 5056 },
    ]);
  });

  it('reports each leaf of a section added or removed', () => {
    expect(diffChanges({}, { kiss: { port: '/dev/x', baud_rate: 9600 } })).toEqual([
      { path: 'kiss.baud_rate', from: undefined, to: 9600 },
      { path: 'kiss.port', from: undefined, to: '/dev/x' },
    ]);
    expect(diffChanges({ ch341: { vid: 1 } }, {})).toEqual([
      { path: 'ch341.vid', from: 1, to: undefined },
    ]);
  });

  it('compares arrays as one value', () => {
    expect(diffChanges({ en_pins: [1, 2] }, { en_pins: [1, 2] })).toEqual([]);
    expect(diffChanges({ en_pins: [1, 2] }, { en_pins: [2] })).toEqual([
      { path: 'en_pins', from: [1, 2], to: [2] },
    ]);
  });

  it('formats values for display', () => {
    expect(formatChangeValue(undefined)).toBe('—');
    expect(formatChangeValue('')).toBe('—');
    expect(formatChangeValue([3, 4])).toBe('3, 4');
    expect(formatChangeValue(true)).toBe('on');
    expect(formatChangeValue(5055)).toBe('5055');
  });
});

describe('SaveBar', () => {
  const changes = [
    { label: 'g2 › Port', detail: '5055 → 5056' },
    { label: 'narrow › TX power', detail: '14 → 20' },
  ];

  it('is hidden with no changes', () => {
    const wrapper = mount(SaveBar, { props: { changes: [] } });
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('counts and lists the changes, with the note', () => {
    const wrapper = mount(SaveBar, { props: { changes, note: 'Takes effect after a restart' } });
    expect(wrapper.get('[data-testid="save-bar-summary"]').text()).toBe('2 unsaved changes');
    expect(wrapper.text()).toContain('Takes effect after a restart');
    const items = wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
    expect(items).toEqual(['g2 › Port 5055 → 5056', 'narrow › TX power 14 → 20']);
  });

  it('folds a long list behind a toggle', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ label: `field ${i}` }));
    const wrapper = mount(SaveBar, { props: { changes: many } });
    expect(wrapper.findAll('[data-testid="save-bar-change"]')).toHaveLength(3);
    await wrapper.findAll('button').find((b) => b.text() === '+2 more')!.trigger('click');
    expect(wrapper.findAll('[data-testid="save-bar-change"]')).toHaveLength(5);
  });

  it('emits discard and save, and disables both while saving', async () => {
    const wrapper = mount(SaveBar, { props: { changes } });
    const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;
    await button('Discard').trigger('click');
    await button('Save Changes').trigger('click');
    expect(wrapper.emitted('discard')).toHaveLength(1);
    expect(wrapper.emitted('save')).toHaveLength(1);

    await wrapper.setProps({ saving: true });
    expect(button('Saving...').attributes('disabled')).toBeDefined();
    expect(button('Discard').attributes('disabled')).toBeDefined();
  });
});
