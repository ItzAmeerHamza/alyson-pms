'use strict';

/**
 * Once the employee clicks Start, the live clock keeps moving until a
 * user or device event ends the session. Network, sync, health-check,
 * and generic errors must never Stop it. Offline work queues and resyncs.
 */
const LIVE_CLOCK_STOP_REASONS = new Set([
  'manual',
  'idle_timeout',
  'idle',
  'on_break',
  'system_sleep',
  'suspend',
  'display_sleep',
  'shutdown',
  'system_shutdown',
  'quit',
  'app_quit',
  'logout',
  'permissions_revoked',
  'cross_midnight',
  'frozen_stop',
]);

function isAllowedLiveClockStopReason(reason) {
  return LIVE_CLOCK_STOP_REASONS.has(String(reason || '').trim());
}

module.exports = {
  LIVE_CLOCK_STOP_REASONS,
  isAllowedLiveClockStopReason,
};
