const {
  computeEffectiveSeconds,
  resolveLiveNonEffectiveSeconds,
} = require('../effective-time');

describe('resolveLiveNonEffectiveSeconds', () => {
  it('Stop/Pause must not apply a late Pulse jump over the already-shown split', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 50 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 0,
        lastDisplayed: 30 * 60,
        isLive: false,
      }),
    ).toBe(30 * 60);
  });

  it('keeps the live overlay after Stop so the cards do not drop', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 10 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 20 * 60,
        lastDisplayed: 50 * 60,
        isLive: false,
      }),
    ).toBe(50 * 60);
  });

  it('overlays reportable live idle so Stop does not jump the card', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 30 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 20 * 60,
        isLive: true,
      }),
    ).toBe(50 * 60);
  });

  it('ignores live idle under the 5-minute Pulse floor', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 30 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 4 * 60,
        isLive: true,
      }),
    ).toBe(30 * 60);
  });

  it('does not double-count when Pulse already includes the session idle', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 50 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 20 * 60,
        isLive: true,
      }),
    ).toBe(50 * 60);
  });

  it('keeps Pulse when the session has no idle', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 30 * 60,
        nonEffectiveAtLiveStart: 30 * 60,
        sessionIdleSeconds: 0,
        isLive: true,
      }),
    ).toBe(30 * 60);
  });

  it('effective + non-effective still equals tracked after overlay', () => {
    const tracked = 2 * 3600;
    const nonEffective = resolveLiveNonEffectiveSeconds({
      pulseNonEffective: 30 * 60,
      nonEffectiveAtLiveStart: 30 * 60,
      sessionIdleSeconds: 20 * 60,
      isLive: true,
    });
    const split = computeEffectiveSeconds(tracked, 0, nonEffective);
    expect(split.nonEffectiveSeconds).toBe(50 * 60);
    expect(split.effectiveSeconds).toBe(tracked - 50 * 60);
  });
});
