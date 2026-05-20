// Run this in the desktop app's Developer Console (Help → Toggle Developer Tools)
console.log('=== ACTIVITY DIAGNOSTICS ===');
console.log('1. global.betweenScreenshotsActivity:', global.betweenScreenshotsActivity);
console.log('2. global.enhancedActivityManager?.betweenScreenshotsActivity:', global.enhancedActivityManager?.betweenScreenshotsActivity);
console.log('3. global.displayActivityStats:', {
  clicks: global.displayActivityStats?.clicks,
  keys: global.displayActivityStats?.keys,
  moves: global.displayActivityStats?.moves,
  totalClicks: global.displayActivityStats?.totalClicks,
  totalKeys: global.displayActivityStats?.totalKeys,
  totalMoves: global.displayActivityStats?.totalMoves
});
console.log('4. Tracking state:', {
  isTracking: global.isTracking,
  currentTimeLogId: global.currentTimeLogId,
  currentProjectId: global.currentProjectId
});
console.log('5. Screenshot manager state:', {
  hasScreenshotManager: !!global.enhancedScreenshotManager,
  isTracking: global.enhancedScreenshotManager?.isTracking
});
