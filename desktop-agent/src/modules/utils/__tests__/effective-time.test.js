const {
  computeEffectiveSeconds,
  resolveLiveNonEffectiveSeconds,
} = require('../effective-time');

describe('resolveLiveNonEffectiveSeconds', () => {
  it('Hamza 12 Oct: local idle and a painted high-water cannot raise the Pulse number', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 18 * 60,
        nonEffectiveAtLiveStart: 18 * 60,
        sessionIdleSeconds: 90 * 60,
        lastDisplayed: 86 * 60,
        isLive: true,
      }),
    ).toBe(18 * 60);
  });

  it('a later Pulse read of 0 replaces a card that already showed meeting idle', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 0,
        nonEffectiveAtLiveStart: 10 * 60,
        sessionIdleSeconds: 10 * 60,
        lastDisplayed: 10 * 60,
        isLive: true,
      }),
    ).toBe(0);
  });

  it('after Stop the card still shows Pulse, not the last painted local split', () => {
    expect(
      resolveLiveNonEffectiveSeconds({
        pulseNonEffective: 18 * 60,
        sessionIdleSeconds: 20 * 60,
        lastDisplayed: 50 * 60,
        isLive: false,
      }),
    ).toBe(18 * 60);
  });

  it('effective + non-effective still equals tracked', () => {
    const tracked = 2 * 3600;
    const nonEffective = resolveLiveNonEffectiveSeconds({
      pulseNonEffective: 18 * 60,
    });
    const split = computeEffectiveSeconds(tracked, 0, nonEffective);
    expect(split.nonEffectiveSeconds).toBe(18 * 60);
    expect(split.effectiveSeconds).toBe(tracked - 18 * 60);
  });
});
