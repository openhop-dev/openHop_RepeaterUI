/**
 * Policy Engine without an edit mode: the policy is editable as loaded, the
 * save bar names what changed, and Save sends the document as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PolicyEngineSettings from '@/components/configuration/PolicyEngineSettings.vue';
import ApiService from '@/utils/api';

const DOCUMENT = {
  policy_engine: {
    enabled: false,
    default_action: 'allow',
    rules: [],
    objects: {},
  },
  groups: { channel_hashes: [], pubkeys: [] },
};

const apiMock = vi.hoisted(() => ({
  getPolicyDocument: vi.fn(),
  updatePolicyDocument: vi.fn(),
  validatePolicyDocument: vi.fn(),
}));

vi.mock('@/utils/api', () => ({ default: apiMock, ApiService: apiMock }));
// The arguments the page gave the leave guard: (isDirty, saving, discard, save).
const guard = vi.hoisted(() => ({ args: [] as unknown[] }));

vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: (...args: unknown[]) => {
    guard.args = args;
    return {
      showUnsavedModal: false,
      requestLeave: vi.fn(),
      handleDiscard: vi.fn(),
      handleSave: vi.fn(),
      handleCancel: vi.fn(),
    };
  },
}));

function mountPage() {
  return mount(PolicyEngineSettings, { global: { stubs: { UnsavedChangesModal: true } } });
}

function changes(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAll('[data-testid="save-bar-change"]').map((li) => li.text());
}

function button(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text);
}

describe('PolicyEngineSettings without an edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getPolicyDocument.mockResolvedValue({ success: true, data: structuredClone(DOCUMENT) });
    apiMock.updatePolicyDocument.mockResolvedValue({ success: true, message: 'saved' });
  });

  it('loads editable and shows no save bar until something changes', async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(button(wrapper, 'Edit Settings')).toBeUndefined();
    const enabled = wrapper.find('input[type="checkbox"]');
    expect(enabled.attributes('disabled')).toBeUndefined();
    expect(button(wrapper, 'Add Rule')!.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('names the changes and saves the document', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.attributes('value') === 'drop'))!
      .setValue('drop');
    await flushPromises();

    expect(changes(wrapper)).toEqual(['Policy engine off → on', 'Default action allow → drop']);

    await button(wrapper, 'Save Changes')!.trigger('click');
    await flushPromises();
    expect(ApiService.updatePolicyDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        policy_engine: expect.objectContaining({ enabled: true, default_action: 'drop' }),
      }),
    );
  });

  it('discards changes back to the loaded policy', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await button(wrapper, 'Discard')!.trigger('click');
    await flushPromises();

    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
    expect(ApiService.updatePolicyDocument).not.toHaveBeenCalled();
  });

  it('opens the JSON editor on a stored rule without reporting a change', async () => {
    // A single-condition rule as stored; the table normalises it to an all-list.
    const doc = structuredClone(DOCUMENT);
    (doc.policy_engine.rules as unknown[]) = [
      {
        id: 1,
        name: 'far',
        enabled: true,
        if: { field: 'hop_count', op: 'greater_than', value: 2 },
        then: { action: 'drop' },
      },
    ];
    apiMock.getPolicyDocument.mockResolvedValue({ success: true, data: doc });
    const wrapper = mountPage();
    await flushPromises();
    await button(wrapper, 'Advanced JSON')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="save-bar"]').exists()).toBe(false);
  });

  it('keeps the JSON editor open while its JSON does not parse', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await button(wrapper, 'Advanced JSON')!.trigger('click');
    await wrapper.find('textarea').setValue('[ not json');
    await flushPromises();
    expect(changes(wrapper)).toEqual(['Rules JSON not valid yet']);

    await button(wrapper, 'Hide JSON')!.trigger('click');
    await flushPromises();
    expect(button(wrapper, 'Hide JSON')).toBeDefined();
    expect(wrapper.text()).toContain('Fix the rules JSON before hiding it');
  });

  describe('an open rule edit', () => {
    const ruleName = (wrapper: ReturnType<typeof mountPage>) =>
      wrapper.find('input[placeholder="Block noisy channel route"]');
    const isEditing = (wrapper: ReturnType<typeof mountPage>) =>
      (wrapper.vm as unknown as { isEditing: boolean }).isEditing;
    const saveOnLeave = () => (guard.args[3] as () => Promise<boolean>)();

    it('counts as unsaved once it differs from the rule as opened', async () => {
      const wrapper = mountPage();
      await flushPromises();
      await button(wrapper, 'Add Rule')!.trigger('click');
      expect(isEditing(wrapper)).toBe(false);

      await ruleName(wrapper).setValue('far hops');
      expect(isEditing(wrapper)).toBe(true);
    });

    it('is applied and saved when leaving with Save', async () => {
      const wrapper = mountPage();
      await flushPromises();
      await button(wrapper, 'Add Rule')!.trigger('click');
      await ruleName(wrapper).setValue('far hops');

      const saved = await saveOnLeave();
      await flushPromises();
      expect(saved).toBe(true);
      expect(JSON.stringify(apiMock.updatePolicyDocument.mock.calls[0][0])).toContain('far hops');
    });

    it('stops the leave when it does not validate', async () => {
      const wrapper = mountPage();
      await flushPromises();
      await button(wrapper, 'Add Rule')!.trigger('click');
      await ruleName(wrapper).setValue('');

      expect(await saveOnLeave()).toBe(false);
      expect(apiMock.updatePolicyDocument).not.toHaveBeenCalled();
      expect(ruleName(wrapper).exists()).toBe(true);
      expect(wrapper.text()).toContain('Rule name is required');
    });
  });
});
