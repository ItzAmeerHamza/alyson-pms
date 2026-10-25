const registry = require('../cleanup-registry');

describe('cleanup registry interval map', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('drops intervals that were cleared outside the registry', () => {
    const before = registry.intervals.size;
    const a = setInterval(() => {}, 100000);
    registry.registerInterval(a, 'a');
    clearInterval(a);
    const b = setInterval(() => {}, 100000);
    registry.registerInterval(b, 'b');
    expect(registry.intervals.has(a)).toBe(false);
    expect(registry.intervals.has(b)).toBe(true);
    expect(registry.intervals.size).toBe(before + 1);
    registry.clearInterval(b);
  });
});
