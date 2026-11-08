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
vi.mock('@/composables/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    showUnsavedModal: false,
    requestLeave: vi.fn(),
    handleDiscard: vi.fn(),
    handleSave: vi.fn(),
    handleCancel: vi.fn(),
  }),
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
});
