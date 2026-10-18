const vm = require('vm');
const { stringifyConsoleArgs } = require('../logger');

describe('stringifyConsoleArgs error formatting', () => {
  it('keeps the message that JSON.stringify drops', () => {
    expect(JSON.stringify(new Error('keychain locked'))).toBe('{}');
    const line = stringifyConsoleArgs(['❌ [MAIN] Failed to retrieve credentials:', new Error('keychain locked')]);
    expect(line).toMatch(/^❌ \[MAIN\] Failed to retrieve credentials: Error: keychain locked/);
  });

  it('includes the network cause behind "fetch failed"', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.com'), {
      code: 'ENOTFOUND',
      syscall: 'getaddrinfo',
      hostname: 'api.example.com',
    });
    const line = stringifyConsoleArgs(['❌ [SYNC] App logs batch insert failed:', new TypeError('fetch failed', { cause })]);
    expect(line).toContain('TypeError: fetch failed');
    expect(line).toContain('"code":"ENOTFOUND"');
    expect(line).toContain('"hostname":"api.example.com"');
    expect(line).toContain('"syscall":"getaddrinfo"');
  });

  it('formats errors nested inside logged objects', () => {
    const line = stringifyConsoleArgs([{ id: 7, error: new RangeError('bad offset') }]);
    expect(JSON.parse(line)).toMatchObject({ id: 7, error: { name: 'RangeError', message: 'bad offset' } });
  });

  it('never copies request config or headers from HTTP client errors', () => {
    const error = Object.assign(new Error('Request failed with status code 500'), {
      status: 500,
      config: { headers: { 'x-api-key': 'secret-key-value' } },
      response: { data: { token: 'secret-token' } },
    });
    const line = stringifyConsoleArgs(['upload failed:', error]);
    expect(line).toContain('"status":500');
    expect(line).not.toContain('secret');
  });

  it('keeps only the first stack frames', () => {
    const error = new Error('deep');
    error.stack = ['Error: deep', ...Array.from({ length: 20 }, (_, i) => `    at frame${i} (file.js:${i}:1)`)].join('\n');
    const line = stringifyConsoleArgs([error]);
    expect(line).toContain('frame4');
    expect(line).not.toContain('frame5');
  });

  it('recognises errors from another realm', () => {
    const foreign = vm.runInNewContext('new Error("from another context")');
    expect(foreign instanceof Error).toBe(false);
    expect(stringifyConsoleArgs([foreign])).toMatch(/^Error: from another context/);
  });

  it('leaves strings and plain values unchanged', () => {
    expect(stringifyConsoleArgs(['a', 1, { b: 2 }, null])).toBe('a 1 {"b":2} null');
  });
});
