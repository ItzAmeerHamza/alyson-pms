/**
 * Monitor App Detection in Real-Time
 * Polls the running app's detection status
 */

console.log('🔍 Monitoring App Detection...\n');
console.log('Press Ctrl+C to stop\n');

const { exec } = require('child_process');
let lastApp = '';

function checkDetection() {
  // Check the logs for recent app detection
  exec('powershell "Get-Content C:\\Users\\mohammedabdulfattah\\Downloads\\EBdaaCode\\time-flow-admin\\desktop-agent\\*.log -Tail 50 | Select-String -Pattern \'Detected|detected|App Name|DWELL\' | Select-Object -Last 5"', 
    (error, stdout, stderr) => {
      if (!error && stdout) {
        const output = stdout.trim();
        if (output !== lastApp) {
          lastApp = output;
          console.log(`[${new Date().toLocaleTimeString()}] Recent detection logs:`);
          console.log(output);
          console.log('---');
        }
      }
    });
}

// Check every 5 seconds
setInterval(checkDetection, 5000);
checkDetection(); // Initial check

console.log('✅ Monitoring started. Logs will appear as apps are detected...\n');











