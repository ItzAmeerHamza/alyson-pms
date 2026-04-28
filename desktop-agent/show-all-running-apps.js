/**
 * Show ALL running applications detected by our detection system
 */

console.log('🔍 Scanning ALL running applications...\n');

const simpleDetection = require('./src/platform/windows/simple-app-detection');

async function showAllApps() {
  try {
    console.log('Getting all desktop applications...\n');
    const apps = await simpleDetection.getAllDesktopApplications();
    
    console.log(`Found ${apps.length} applications:\n`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Group by app name
    const grouped = {};
    apps.forEach(app => {
      if (!grouped[app.appName]) {
        grouped[app.appName] = {
          count: 0,
          isBrowser: app.isBrowser,
          method: app.method
        };
      }
      grouped[app.appName].count++;
    });
    
    // Sort by importance
    const sorted = Object.entries(grouped).sort((a, b) => {
      // Browsers first
      if (a[1].isBrowser && !b[1].isBrowser) return -1;
      if (!a[1].isBrowser && b[1].isBrowser) return 1;
      
      // Then by count
      return b[1].count - a[1].count;
    });
    
    sorted.forEach(([appName, info]) => {
      const icon = info.isBrowser ? '🌐' : '📱';
      const instances = info.count > 1 ? ` (${info.count} processes)` : '';
      console.log(`${icon} ${appName}${instances}`);
    });
    
    console.log('\n═══════════════════════════════════════════════════════\n');
    
    // Now show what's detected as ACTIVE
    console.log('🎯 Currently ACTIVE app (what our detection picks):\n');
    const activeApp = await simpleDetection.detectActiveApp();
    if (activeApp) {
      console.log(`   App: ${activeApp.appName}`);
      console.log(`   Window: ${activeApp.windowTitle}`);
      console.log(`   Is Browser: ${activeApp.isBrowser}`);
      console.log(`   Method: ${activeApp.method}`);
    } else {
      console.log('   ❌ No app detected!');
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    
    // Show which browsers are running but NOT selected
    const browsers = sorted.filter(([name, info]) => info.isBrowser);
    if (browsers.length > 0 && activeApp && !activeApp.isBrowser) {
      console.log('\n⚠️  BROWSERS RUNNING BUT NOT DETECTED AS ACTIVE:\n');
      browsers.forEach(([name]) => {
        console.log(`   🌐 ${name}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

showAllApps();









