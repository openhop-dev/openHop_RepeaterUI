import { beforeEach, describe, expect, it, vi } from 'vitest';

const appRuntimeMock = {
  handleAuthFailure: vi.fn().mockResolvedValue(undefined),
};

const generatedApiClientMock = {
  gps: { getGps: vi.fn() },
  logs: { logsList: vi.fn() },
  pingNeighbor: { pingNeighborCreate: vi.fn() },
  dbStats: { dbStatsList: vi.fn() },
  dbPurge: { dbPurgeCreate: vi.fn() },
  dbVacuum: { dbVacuumCreate: vi.fn() },
  configExport: { configExportList: vi.fn() },
} as const;

vi.mock('@/services/api/generatedClient', () => ({
  generatedApiClient: generatedApiClientMock,
}));

vi.mock('@/stores/appRuntime', () => ({
  useAppRuntimeStore: () => appRuntimeMock,
}));

vi.mock('@/utils/auth', () => ({
  getToken: vi.fn(() => null),
  isTokenExpired: vi.fn(() => false),
  shouldRefreshToken: vi.fn(() => false),
  setToken: vi.fn(),
  getClientId: vi.fn(() => 'test-client'),
}));

describe('ApiService contract regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pingNeighbor sends target_id payload and returns response body', async () => {
    const response = {
      data: {
        success: true,
        data: {
          target_id: '0x42',
          rtt_ms: 12.3,
          snr_db: 4.2,
          rssi: -90,
          path: ['0x42'],
          tag: 123,
          path_hash_mode: 0,
        },
      },
    };
    generatedApiClientMock.pingNeighbor.pingNeighborCreate.mockResolvedValue(response);

    const { default: ApiService } = await import('@/utils/api');
    const result = await ApiService.pingNeighbor('0x42', 8);

    expect(generatedApiClientMock.pingNeighbor.pingNeighborCreate).toHaveBeenCalledWith(
      { target_id: '0x42', timeout: 8 },
      {},
    );
    expect(result.data?.target_id).toBe('0x42');
  });

  it('getLogs returns typed logs list directly from generated client', async () => {
    generatedApiClientMock.logs.logsList.mockResolvedValue({
      data: {
        logs: [
          {
            message: 'boot ok',
            timestamp: '2026-05-28T12:00:00Z',
            level: 'INFO',
          },
        ],
      },
    });

    const { default: ApiService } = await import('@/utils/api');
    const result = await ApiService.getLogs();

    expect(generatedApiClientMock.logs.logsList).toHaveBeenCalledWith({});
    expect(result.logs[0].message).toBe('boot ok');
  });

  it('getGpsDiagnostics passes through generated payload with raw_attributes map', async () => {
    generatedApiClientMock.gps.getGps.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          running: true,
          raw_attributes: {
            sentence_type: 'RMC',
            checksum_ok: true,
          },
        },
      },
    });

    const { default: ApiService } = await import('@/utils/api');
    const result = await ApiService.getGpsDiagnostics();

    expect(generatedApiClientMock.gps.getGps).toHaveBeenCalledWith({});
    expect(result.data?.raw_attributes?.sentence_type).toBe('RMC');
  });

  it('db methods call generated endpoints and return response body', async () => {
    generatedApiClientMock.dbStats.dbStatsList.mockResolvedValue({
      data: {
        success: true,
        data: {
          database_size_bytes: 100,
          rrd_size_bytes: 10,
          tables: [],
        },
      },
    });
    generatedApiClientMock.dbPurge.dbPurgeCreate.mockResolvedValue({
      data: {
        success: true,
        message: 'Purged 1 table(s)',
        data: {
          packets: { deleted: 5 },
        },
      },
    });
    generatedApiClientMock.dbVacuum.dbVacuumCreate.mockResolvedValue({
      data: {
        success: true,
        data: {
          size_before: 100,
          size_after: 80,
          freed_bytes: 20,
        },
      },
    });

    const { default: ApiService } = await import('@/utils/api');

    const stats = await ApiService.getDbStats();
    const purge = await ApiService.purgeTable(['packets']);
    const vacuum = await ApiService.vacuumDb();

    expect(generatedApiClientMock.dbStats.dbStatsList).toHaveBeenCalledWith({});
    expect(generatedApiClientMock.dbPurge.dbPurgeCreate).toHaveBeenCalledWith(
      { tables: ['packets'] },
      {},
    );
    expect(generatedApiClientMock.dbVacuum.dbVacuumCreate).toHaveBeenCalledWith({});

    expect(stats.data?.database_size_bytes).toBe(100);
    expect(purge.data?.packets?.deleted).toBe(5);
    expect(vacuum.data?.freed_bytes).toBe(20);
  });

  it('exportConfig maps includeSecrets flag to include_secrets query param', async () => {
    generatedApiClientMock.configExport.configExportList.mockResolvedValue({
      data: {
        success: true,
        data: {
          meta: {
            exported_at: '2026-05-28T12:00:00Z',
            version: '1.0.0',
            config_path: '/tmp/config.yaml',
            includes_secrets: true,
          },
          config: {},
        },
      },
    });

    const { default: ApiService } = await import('@/utils/api');
    await ApiService.exportConfig(true);

    expect(generatedApiClientMock.configExport.configExportList).toHaveBeenCalledWith(
      { include_secrets: true },
      {},
    );
  });
});
