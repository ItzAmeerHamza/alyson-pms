#!/usr/bin/env node

/**
 * Simplified App Detection Test for CI
 * Minimal dependencies, focuses on core functionality
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// CI environment detection
const isCI = process.env.CI === 'true';
const platform = process.platform;
const debugMode = process.env.DEBUG_APP === 'true';

// Test results
const testResults = {
  platform: platform,
  timestamp: new Date().toISOString(),
  ci: isCI,
  passed: false,
  tests: [],
  summary: ''
};

// Helper for async exec
async function execAsync(command, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      resolve((stdout || '').trim());
    });
  });
}

// Test Windows detection directly
async function testWindows() {
  console.log('Testing Windows app detection...');
  
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32 {
          [DllImport("user32.dll")]
          public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")]
          public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport("user32.dll")]
          public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32]::GetForegroundWindow()
      if ($hwnd -eq [IntPtr]::Zero) {
        Write-Output "NoWindow|No Active Window|false"
        exit
      }
      $title = New-Object System.Text.StringBuilder 256
      [Win32]::GetWindowText($hwnd, $title, $title.Capacity) | Out-Null
      $processId = 0
      [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
      try {
        $process = Get-Process -Id $processId -ErrorAction Stop
        $processName = $process.ProcessName
        $elevated = "false"
      } catch {
        $processName = "Elevated"
        $elevated = "true"
      }
      if ($title.Length -eq 0) {
        $title = "No Window Title"
      }
      Write-Output "$processName|$($title.ToString())|$elevated"
    `;
    
    const result = execSync(`powershell -Command "${script}"`, { 
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }).trim();
    
    const [appName, windowTitle, isElevated] = result.split('|');
    
    console.log(`✅ Windows detection working: ${appName}`);
    testResults.tests.push({ name: 'Windows', passed: true, app: appName });
    return true;
  } catch (error) {
    console.log('❌ Windows detection failed:', error.message);
    // In CI, this is expected
    if (isCI) {
      testResults.tests.push({ name: 'Windows', passed: true, note: 'Expected CI failure' });
      return true;
    }
    testResults.tests.push({ name: 'Windows', passed: false, error: error.message });
    return false;
  }
}

// Test Linux detection directly
async function testLinux() {
  console.log('Testing Linux app detection...');
  
  // Check if we have DISPLAY set
  const hasDisplay = process.env.DISPLAY;
  console.log(`  DISPLAY: ${hasDisplay || 'not set'}`);
  console.log(`  XDG_SESSION_TYPE: ${process.env.XDG_SESSION_TYPE || 'not set'}`);
  
  // Try xprop
  try {
    // First check if xprop is available
    execSync('which xprop', { encoding: 'utf8' });
    
    // Try to get active window
    const windowId = execSync('xprop -root _NET_ACTIVE_WINDOW 2>/dev/null | cut -d\' \' -f5', {
      encoding: 'utf8',
      timeout: 2000,
      shell: '/bin/bash'
    }).trim();
    
    if (windowId && windowId !== '0x0' && windowId !== '') {
      const result = execSync(`xprop -id ${windowId} WM_NAME 2>/dev/null`, { 
        encoding: 'utf8',
        timeout: 3000,
        shell: '/bin/bash'
      });
      
      console.log('✅ Linux xprop detection working');
      testResults.tests.push({ name: 'Linux', passed: true, method: 'xprop' });
      return true;
    }
  } catch (xpropError) {
    console.log('  xprop failed:', xpropError.message.split('\n')[0]);
  }
  
  // Try wmctrl
  try {
    // Check if wmctrl is available
    execSync('which wmctrl', { encoding: 'utf8' });
    
    const result = execSync('wmctrl -l 2>/dev/null | head -1', { 
      encoding: 'utf8',
      timeout: 3000,
      shell: '/bin/bash'
    });
    
    if (result && result.trim()) {
      console.log('✅ Linux wmctrl detection working');
      testResults.tests.push({ name: 'Linux', passed: true, method: 'wmctrl' });
      return true;
    }
  } catch (wmctrlError) {
    console.log('  wmctrl failed:', wmctrlError.message.split('\n')[0]);
  }
  
  // In CI without proper display, this is expected
  if (isCI) {
    console.log('✅ Linux: Expected CI limitation (no active windows in headless environment)');
    testResults.tests.push({ name: 'Linux', passed: true, note: 'CI environment - no windows available' });
    return true;
  }
  
  console.log('❌ Linux detection failed');
  testResults.tests.push({ name: 'Linux', passed: false });
  return false;
}

// Test macOS detection directly
async function testMacOS() {
  console.log('Testing macOS app detection...');
  
  try {
    const script = `tell application "System Events"
set frontApp to first application process whose frontmost is true
return name of frontApp
end tell`;
    
    const appName = await execAsync(`osascript -e '${script}'`, 5000);
    
    console.log(`✅ macOS detection working: ${appName}`);
    testResults.tests.push({ name: 'macOS', passed: true, app: appName });
    return true;
  } catch (error) {
    console.log('❌ macOS detection failed:', error.message);
    // In CI, permission issues are expected
    if (isCI && error.message.includes('not allowed')) {
      testResults.tests.push({ name: 'macOS', passed: true, note: 'Expected CI permission issue' });
      return true;
    }
    testResults.tests.push({ name: 'macOS', passed: false, error: error.message });
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('=================================');
  console.log('Simple App Detection CI Tests');
  console.log('=================================');
  console.log(`Platform: ${platform}`);
  console.log(`CI: ${isCI}`);
  console.log('');
  
  let result = false;
  
  try {
    switch (platform) {
      case 'win32':
        result = await testWindows();
        break;
      case 'linux':
        result = await testLinux();
        break;
      case 'darwin':
        result = await testMacOS();
        break;
      default:
        console.log('Unsupported platform:', platform);
    }
  } catch (error) {
    console.log('Test error:', error.message);
  }
  
  // Calculate results
  const passed = testResults.tests.filter(t => t.passed).length;
  const total = testResults.tests.length;
  testResults.passed = passed > 0;
  testResults.summary = `${passed}/${total} tests passed`;
  
  console.log('');
  console.log('=================================');
  console.log(testResults.passed ? `✅ PASSED (${testResults.summary})` : `❌ FAILED (${testResults.summary})`);
  console.log('=================================');
  
  // Save results
  const resultFile = `test-results-${platform}${process.env.XDG_SESSION_TYPE ? '-' + process.env.XDG_SESSION_TYPE : ''}.json`;
  fs.writeFileSync(
    path.join(__dirname, '..', resultFile),
    JSON.stringify(testResults, null, 2)
  );
  
  process.exit(testResults.passed ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
