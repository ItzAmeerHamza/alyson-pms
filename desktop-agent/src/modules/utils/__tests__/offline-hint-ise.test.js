/**
 * Generic 500 ISE must not mark the whole agent offline — that parked
 * every frozen Stop behind a 60s hint (Fawad / Vinit queue storms).
 */

jest.mock('../device-id', () => ({ getDeviceId: () => 'test-device' }));

const backendTimeLogs = require('../backend-time-logs');

describe('noteNetworkResult offline hint', () => {
  beforeEach(() => {
    backendTimeLogs.noteNetworkResult(true);
  });

  it('does not set isLikelyOffline for Internal server error 500', () => {
    backendTimeLogs.noteNetworkResult(false, {
      status: 500,
      message: 'Internal server error',
    });
    expect(backendTimeLogs.isLikelyOffline()).toBe(false);
  });

  it('does set isLikelyOffline for 503 database unavailable', () => {
    backendTimeLogs.noteNetworkResult(false, {
      status: 503,
      message: 'Database temporarily unavailable',
    });
    expect(backendTimeLogs.isLikelyOffline()).toBe(true);
  });
});
