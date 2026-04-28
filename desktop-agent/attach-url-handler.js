#!/usr/bin/env node

/**
 * Attach URL Event Handler Script
 * Attaches the missing URL event handler to the running UrlCaptureManager
 */

console.log('🔧 Attaching URL Event Handler...\n');

try {
  // Check if we're in the Electron context
  if (typeof global !== 'undefined' && global.urlCaptureManager) {
    console.log('✅ Found running UrlCaptureManager');
    
    // Check current event listeners
    const currentListeners = global.urlCaptureManager.listenerCount('url');
    console.log('📊 Current URL event listeners:', currentListeners);
    
    if (currentListeners === 0) {
      console.log('❌ NO URL EVENT LISTENERS - This is why URLs are being lost!');
      
      // Attach the URL event handler
      console.log('🔧 Attaching URL event handler...');
      
      global.urlCaptureManager.on('url', (evt) => {
        console.log('🌐 [URL] EVENT RECEIVED:', { url: evt?.url, source: evt?.source, ts: evt?.ts });
        
        // Create the payload for app_url_activity
        const payload = {
          organization_id: null, // Will be set by database trigger
          user_id: global.currentUserId || '0c3d3092-913e-436f-a352-3378e558c34f',
          device_id: null, // Will be set by database trigger
          time_log_id: global.currentTimeLogId || null,
          site_url: evt?.url || null,
          domain: evt?.url ? new URL(evt.url).hostname : null,
          title: evt?.title || '',
          browser: evt?.browser || 'unknown',
          confidence: 'high',
          privacy_flags: evt?.privacyFlags || null,
          started_at: new Date((evt && evt.ts) ?? Date.now()).toISOString(),
          ended_at: null // Will be closed by next URL or cleanup
        };
        
        console.log('🌐 [URL] PROCESSING PAYLOAD:', { domain: payload.domain, browser: payload.browser });
        
        // Try to save via enhancedSyncManager first
        if (global.enhancedSyncManager && global.enhancedSyncManager.addToQueue) {
          console.log('🌐 [URL] Using enhancedSyncManager.addToQueue');
          global.enhancedSyncManager.addToQueue('urlLogs', [payload]);
          console.log('🌐 [URL] Queued via enhancedSyncManager:', payload.domain);
        } else if (global.supabaseService && typeof global.supabaseService.from === 'function') {
          console.log('🌐 [URL] Using direct Supabase service');
          // Direct database save fallback
          try {
            global.supabaseService.from('app_url_activity').insert([payload]).then(({ error }) => {
              if (error) {
                console.error('❌ [URL] Direct DB insert to app_url_activity failed:', error.message);
              } else {
                console.log('✅ [URL] Direct DB insert to app_url_activity succeeded:', payload.domain);
              }
            });
          } catch (e) {
            console.error('❌ [URL] Direct DB insert error:', e.message);
          }
        } else {
          console.log('❌ [URL] No sync manager or Supabase service available');
          console.log('🌐 [URL] DEBUG - enhancedSyncManager exists:', !!global.enhancedSyncManager);
          console.log('🌐 [URL] DEBUG - supabaseService exists:', !!global.supabaseService);
        }
      });
      
      console.log('✅ URL event handler attached successfully!');
      console.log('📊 New URL event listeners:', global.urlCaptureManager.listenerCount('url'));
      
    } else {
      console.log('✅ URL event listeners already exist');
    }
    
    // Check other required services
    console.log('\n🔍 Checking required services:');
    console.log('- enhancedSyncManager:', !!global.enhancedSyncManager);
    console.log('- supabaseService:', !!global.supabaseService);
    console.log('- trackingManager:', !!global.trackingManager);
    console.log('- currentUserId:', global.currentUserId);
    console.log('- currentTimeLogId:', global.currentTimeLogId);
    
  } else {
    console.log('❌ UrlCaptureManager not found in global scope');
    console.log('This script must run in the Electron main process context');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

console.log('\n📋 Next steps:');
console.log('1. Navigate to a website in Safari/Chrome');
console.log('2. Check if URL events are now being processed');
console.log('3. Verify URLs are being saved to database');
