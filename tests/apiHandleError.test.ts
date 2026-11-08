/**
 * The generated fetch client throws its HttpResponse rather than an Error; the
 * server's reason in the JSON body must reach the caller, not "Unknown error".
 */
import { describe, expect, it, vi } from 'vitest';
import ApiService from '@/utils/api';
import { generatedApiClient } from '@/services/api/generatedClient';

function httpResponse(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), { status }) as Response & { error?: unknown };
  response.error = body;
  return response;
}

describe('ApiService errors from the generated client', () => {
  it('passes on the server’s error message', async () => {
    vi.spyOn(generatedApiClient.radioFrontend, 'radioFrontendList').mockRejectedValue(
      httpResponse(404, { success: false, error: "Unknown radio_id 'nope'" }),
    );
    await expect(ApiService.getRadioFrontend('nope')).rejects.toThrow("Unknown radio_id 'nope'");
  });

  it('falls back to the status without a JSON error', async () => {
    vi.spyOn(generatedApiClient.radioFrontend, 'radioFrontendCreate').mockRejectedValue(
      httpResponse(409, null),
    );
    await expect(ApiService.setRadioFrontend({ fem_rx_gain: true }, 'g2')).rejects.toThrow(
      'HTTP 409',
    );
  });

  it('sends the radio id in the body, not as auth params', async () => {
    const create = vi
      .spyOn(generatedApiClient.radioFrontend, 'radioFrontendCreate')
      .mockResolvedValue({ data: { success: true } } as never);
    await ApiService.setRadioFrontend({ fem_rx_gain: true }, 'g2');
    const [body, query, params] = create.mock.calls[0];
    expect(body).toEqual({ fem_rx_gain: true, radio_id: 'g2' });
    expect(query).toBeUndefined();
    expect(params).toBeDefined();
  });
});
