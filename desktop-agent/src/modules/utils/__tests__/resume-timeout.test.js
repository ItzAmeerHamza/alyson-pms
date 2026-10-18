const EventHandlerManager = require('../event-handler-manager');

function manager() {
  const m = Object.create(EventHandlerManager.prototype);
  m.console = { warn: jest.fn(), log: jest.fn() };
  return m;
}

describe('resume timeouts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('does not warn when the work finishes first', async () => {
    const m = manager();
    const result = await m._withResumeTimeout(Promise.resolve({ id: 1 }), 5000, 'timed out');
    jest.advanceTimersByTime(10000);
    expect(result).toEqual({ id: 1 });
    expect(m.console.warn).not.toHaveBeenCalled();
  });

  it('warns and resolves null on a real timeout', async () => {
    const m = manager();
    const pending = m._withResumeTimeout(new Promise(() => {}), 5000, 'timed out');
    jest.advanceTimersByTime(5000);
    await expect(pending).resolves.toBeNull();
    expect(m.console.warn).toHaveBeenCalledWith('timed out');
  });
});
