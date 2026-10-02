import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SensorManagerSettings from '@/components/configuration/SensorManagerSettings.vue';
import { ApiService } from '@/utils/api';

vi.mock('@/utils/api', () => ({
  ApiService: {
    getSensorTypes: vi.fn(),
    getSensorConfig: vi.fn(),
    updateSensorConfig: vi.fn(),
  },
}));

describe('Sensor Manager', () => {
  it.each(['page save first', 'row save first'])(
    'persists an edited definition when %s',
    async (order) => {
      vi.clearAllMocks();
      vi.mocked(ApiService.getSensorTypes).mockResolvedValue({
        success: true,
        data: { types: [] },
      } as never);
      vi.mocked(ApiService.getSensorConfig).mockResolvedValue({
        success: true,
        data: {
          enabled: true,
          poll_interval_seconds: 30,
          auto_install_packages: false,
          definitions: [
            {
              name: 'modem',
              _original_name: 'modem',
              type: 'openhop_modem',
              enabled: true,
              settings: { host: 'first.local' },
            },
          ],
        },
      } as never);
      vi.mocked(ApiService.updateSensorConfig).mockResolvedValue({
        success: true,
        data: { saved: true, restart_required: false, message: 'saved' },
      } as never);
      const wrapper = mount(SensorManagerSettings, {
        global: { stubs: { RestartModal: true, UnsavedChangesModal: true, Spinner: true } },
      });
      await flushPromises();
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Edit Sensors')!
        .trigger('click');
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Edit')!
        .trigger('click');
      await wrapper.findAll('input[type="text"]')[0].setValue('renamed');
      if (order === 'row save first') {
        await wrapper
          .findAll('button')
          .find((b) => b.text() === 'Save')!
          .trigger('click');
      }
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Save Changes')!
        .trigger('click');
      await flushPromises();
      expect(vi.mocked(ApiService.updateSensorConfig)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(ApiService.updateSensorConfig).mock.calls[0][0].definitions[0].name).toBe(
        'renamed',
      );
      wrapper.unmount();
    },
  );
  it('gets new types from the API and never prints a stored password', async () => {
    vi.mocked(ApiService.getSensorTypes).mockResolvedValue({
      success: true,
      data: {
        types: [
          {
            type: 'future_sensor',
            name: 'Future Sensor',
            description: '',
            settings: [{ key: 'pin', type: 'integer', label: 'Pin', default: 1 }],
          },
          {
            type: 'openhop_modem',
            name: 'Modem',
            description: '',
            settings: [{ key: 'password', type: 'string', label: 'Password', default: '' }],
          },
        ],
      },
    } as never);
    vi.mocked(ApiService.getSensorConfig).mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        poll_interval_seconds: 30,
        auto_install_packages: false,
        definitions: [
          {
            name: 'modem',
            type: 'openhop_modem',
            enabled: true,
            settings: { host: 'modem.local', password: 'private-value' },
          },
        ],
      },
    } as never);
    const wrapper = mount(SensorManagerSettings, {
      global: { stubs: { RestartModal: true, UnsavedChangesModal: true, Spinner: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('*****');
    expect(wrapper.text()).not.toContain('private-value');
    await wrapper.get('button').trigger('click'); // Edit Sensors
    expect(wrapper.text()).not.toContain('private-value');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Add Sensor'))!
      .trigger('click');
    expect(wrapper.find('option[value="future_sensor"]').exists()).toBe(true);
    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Edit')!;
    await editButton.trigger('click');
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('private-value');
    wrapper.unmount();
  });

  it('keeps legacy definitions but offers repeatable openHop Modems, not pyMC Modems', async () => {
    vi.mocked(ApiService.getSensorTypes).mockResolvedValue({
      success: true,
      data: {
        types: [
          {
            type: 'openhop_modem',
            name: 'openHop Modem',
            description: '',
            settings: [{ key: 'host', type: 'string', label: 'Host', default: 'second.local' }],
          },
          { type: 'pymc_modem', name: 'pyMC Modem', description: '', settings: [] },
        ],
      },
    } as never);
    vi.mocked(ApiService.getSensorConfig).mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        poll_interval_seconds: 30,
        auto_install_packages: false,
        definitions: [
          {
            name: 'first',
            type: 'openhop_modem',
            enabled: true,
            settings: { host: 'first.local', password: '*****' },
          },
          {
            name: 'legacy',
            type: 'pymc_modem',
            enabled: true,
            settings: { host: 'legacy.local', password: '*****' },
          },
        ],
      },
    } as never);
    vi.mocked(ApiService.updateSensorConfig).mockResolvedValue({
      success: true,
      data: { saved: true, restart_required: false, message: 'saved' },
    } as never);
    const wrapper = mount(SensorManagerSettings, {
      global: { stubs: { RestartModal: true, UnsavedChangesModal: true, Spinner: true } },
    });
    await flushPromises();
    expect(wrapper.text()).toContain('legacy');
    await wrapper.get('button').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Add Sensor'))!
      .trigger('click');
    expect(wrapper.find('option[value="pymc_modem"]').exists()).toBe(false);
    expect(wrapper.find('option[value="openhop_modem"]').exists()).toBe(true);
    await wrapper.get('select').setValue('openhop_modem');
    const name = wrapper.get('input[placeholder="e.g. living-room-temp"]');
    await name.setValue('first');
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Add')!
        .attributes('disabled'),
    ).toBeDefined();
    await name.setValue('second');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Add')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Save Changes')!
      .trigger('click');
    await flushPromises();
    const calls = vi.mocked(ApiService.updateSensorConfig).mock.calls;
    const saved = calls[calls.length - 1][0];
    expect(saved.definitions.map((def) => [def.name, def.type])).toEqual([
      ['first', 'openhop_modem'],
      ['legacy', 'pymc_modem'],
      ['second', 'openhop_modem'],
    ]);
    expect(saved.definitions[1].settings.password).toBe('*****');
    wrapper.unmount();
  });

  it('refreshes masked credentials and origins after saving a rename', async () => {
    vi.clearAllMocks();
    vi.mocked(ApiService.getSensorTypes).mockResolvedValue({
      success: true,
      data: { types: [] },
    } as never);
    vi.mocked(ApiService.getSensorConfig)
      .mockResolvedValueOnce({
        success: true,
        data: {
          enabled: true,
          poll_interval_seconds: 30,
          auto_install_packages: false,
          definitions: [
            {
              name: 'modem',
              _original_name: 'modem',
              type: 'openhop_modem',
              enabled: true,
              settings: { host: 'first.local', password: '*****' },
            },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        success: true,
        data: {
          enabled: true,
          poll_interval_seconds: 30,
          auto_install_packages: false,
          definitions: [
            {
              name: 'renamed',
              _original_name: 'renamed',
              type: 'openhop_modem',
              enabled: true,
              settings: { host: 'first.local', password: '*****' },
            },
          ],
        },
      } as never);
    vi.mocked(ApiService.updateSensorConfig).mockResolvedValue({
      success: true,
      data: { saved: true, restart_required: false, message: 'saved' },
    } as never);
    const wrapper = mount(SensorManagerSettings, {
      global: { stubs: { RestartModal: true, UnsavedChangesModal: true, Spinner: true } },
    });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click');
    await wrapper.findAll('input[type="text"]')[0].setValue('renamed');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save Changes')!
      .trigger('click');
    await flushPromises();
    expect(vi.mocked(ApiService.getSensorConfig)).toHaveBeenCalledTimes(2);
    await wrapper.get('button').trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save Changes')!
      .trigger('click');
    await flushPromises();
    const calls = vi.mocked(ApiService.updateSensorConfig).mock.calls;
    expect(calls[1][0].definitions[0]).toMatchObject({
      name: 'renamed',
      _original_name: 'renamed',
    });
    wrapper.unmount();
  });

  it('discards unsaved sensor edits instead of retaining them locally', async () => {
    vi.clearAllMocks();
    vi.mocked(ApiService.getSensorTypes).mockResolvedValue({
      success: true,
      data: { types: [] },
    } as never);
    vi.mocked(ApiService.getSensorConfig).mockResolvedValue({
      success: true,
      data: {
        enabled: true,
        poll_interval_seconds: 30,
        auto_install_packages: false,
        definitions: [
          {
            name: 'modem',
            _original_name: 'modem',
            type: 'openhop_modem',
            enabled: true,
            settings: { host: 'first.local', password: '*****' },
          },
        ],
      },
    } as never);
    const wrapper = mount(SensorManagerSettings, {
      global: { stubs: { RestartModal: true, UnsavedChangesModal: true, Spinner: true } },
    });
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Edit')!
      .trigger('click');
    await wrapper.findAll('input[type="text"]')[0].setValue('wrong-name');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Save')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Discard')!
      .trigger('click');
    expect(wrapper.text()).toContain('modem');
    expect(wrapper.text()).not.toContain('wrong-name');
    expect(ApiService.updateSensorConfig).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
