// smoke test script for consolidated screenshot timer
(async () => {
  const fixes = require('./src/fixes/consolidate-screenshots');
  console.log('Scheduling next screenshot 35s for smoke test...');
  fixes.stopExistingScreenshotSystems();
  fixes.scheduleNextScreenshot(35);
})();
