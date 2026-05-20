'use strict';

/**
 * Supabase Realtime needs WebSocket. Node/Electron < 22 has no built-in WebSocket.
 * @returns {import('@supabase/supabase-js').SupabaseClientOptions}
 */
function getSupabaseRealtimeOptions() {
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor >= 22 && typeof globalThis.WebSocket !== 'undefined') {
    return {};
  }
  const ws = require('ws');
  return { realtime: { transport: ws } };
}

module.exports = { getSupabaseRealtimeOptions };
