/**
 * Diagnostic Script for Windows App Detection Issues
 * Run this to identify why app detection is failing
 */

console.log('🔍 Windows App Detection Diagnostic Tool');
console.log('==========================================\n');

const { exec } = require('child_process');
const os = require('os');

function runCommand(name, command, timeoutMs = 3000) {
  return new Promise((resolve) => {
    console.log(`\n📋 Testing: ${name}`);
    console.log(`   Command: ${command}`);
    
    const startTime = Date.now();
    exec(command, { 
      encoding: 'utf8', 
      timeout: timeoutMs,
      windowsHide: false  // Don't hide to see if security prompts appear
    }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      
      if (error) {
        console.log(`   ❌ FAILED (${duration}ms)`);
        console.log(`   Error: ${error.message.substring(0, 150)}`);
        if (stderr) console.log(`   Stderr: ${stderr.substring(0, 150)}`);
        resolve({ success: false, error: error.message, stderr, duration });
      } else {
        console.log(`   ✅ SUCCESS (${duration}ms)`);
        console.log(`   Output length: ${(stdout || '').length} chars`);
        if (stdout && stdout.length < 200) {
          console.log(`   Output: ${stdout.substring(0, 200)}`);
        }
        resolve({ success: true, output: stdout, duration });
      }
    });
  });
}

async function runDiagnostics() {
  console.log('📊 System Information:');
  console.log(`   Platform: ${process.platform}`);
  console.log(`   Architecture: ${process.arch}`);
  console.log(`   Node Version: ${process.version}`);
  console.log(`   OS Type: ${os.type()}`);
  console.log(`   OS Release: ${os.release()}`);
  console.log(`   User: ${os.userInfo().username}`);
  console.log(`   Home Dir: ${os.homedir()}`);
  console.log(`   Temp Dir: ${os.tmpdir()}`);
  console.log(`   CWD: ${process.cwd()}`);
  
  console.log('\n🔐 Environment Variables:');
  console.log(`   PATH: ${process.env.PATH?.substring(0, 200)}...`);
  console.log(`   TEMP: ${process.env.TEMP}`);
  console.log(`   SystemRoot: ${process.env.SystemRoot}`);
  console.log(`   PROCESSOR_ARCHITECTURE: ${process.env.PROCESSOR_ARCHITECTURE}`);
  
  // Test basic commands
  await runCommand('Echo Test', 'echo "Hello World"', 1000);
  
  // Test where command
  await runCommand('Find PowerShell Location', 'where powershell.exe', 2000);
  await runCommand('Find tasklist Location', 'where tasklist.exe', 2000);
  
  // Test PowerShell version
  await runCommand('PowerShell Version', 'powershell.exe -Command "$PSVersionTable.PSVersion"', 3000);
  
  // Test PowerShell execution policy
  await runCommand('Execution Policy', 'powershell.exe -Command "Get-ExecutionPolicy"', 3000);
  
  // Test simple PowerShell command
  await runCommand('PowerShell Simple Command', 'powershell.exe -NoProfile -Command "Write-Output \\"test\\""', 3000);
  
  // Test tasklist basic
  await runCommand('tasklist Basic', 'tasklist', 3000);
  
  // Test tasklist with formatting
  await runCommand('tasklist CSV Format', 'tasklist /FO CSV /NH', 3000);
  
  // Test tasklist verbose
  await runCommand('tasklist Verbose', 'tasklist /V /FO CSV /NH', 5000);
  
  // Test wmic
  await runCommand('wmic Test', 'wmic process get ProcessId /format:list', 3000);
  
  // Test Get-Process via PowerShell
  await runCommand('Get-Process', 'powershell.exe -NoProfile -Command "Get-Process | Select-Object -First 1 Name"', 3000);
  
  console.log('\n==========================================');
  console.log('🏁 Diagnostic Complete');
  console.log('\n💡 Recommendations:');
  console.log('   1. If PowerShell commands fail: Check execution policy');
  console.log('   2. If tasklist fails: Check Windows Defender Application Control');
  console.log('   3. If all commands fail: Run as Administrator');
  console.log('   4. Consider using native Node addon for Windows API');
  console.log('\n📝 To fix execution policy, run as Admin:');
  console.log('   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser');
}

runDiagnostics().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('\n❌ Diagnostic failed:', error.message);
  process.exit(1);
});











