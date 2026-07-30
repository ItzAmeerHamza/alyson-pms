/**
 * Effective / non-effective seconds from tracked + idle + low activity.
 *
 * non_effective = min(total, low + idle)
 * effective     = total - non_effective
 */
function computeEffectiveSeconds(totalSeconds, lowSeconds, idleSeconds) {
  const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const low = Math.max(0, Math.floor(Number(lowSeconds) || 0));
  const idle = Math.max(0, Math.floor(Number(idleSeconds) || 0));
  const nonEffective = Math.min(total, low + idle);
  return {
    totalSeconds: total,
    nonEffectiveSeconds: nonEffective,
    effectiveSeconds: Math.max(0, total - nonEffective),
  };
}

module.exports = { computeEffectiveSeconds };
