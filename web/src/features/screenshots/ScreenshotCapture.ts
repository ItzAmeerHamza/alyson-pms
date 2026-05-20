export function scheduleScreenshots(intervalMs = 300000) {
  // This would use Electron's desktopCapturer in a real implementation
  setInterval(() => {
    console.log('Capturing screenshot...');
  }, intervalMs);
}
