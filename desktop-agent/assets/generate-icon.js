const { nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

// Create a simple black clock icon programmatically
function createClockIcon(size) {
  const canvas = require('canvas');
  const { createCanvas } = canvas;
  
  const img = createCanvas(size, size);
  const ctx = img.getContext('2d');
  
  // Clear with transparent background
  ctx.clearRect(0, 0, size, size);
  
  // Set to pure black
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(2, size / 11);
  ctx.lineCap = 'round';
  
  const center = size / 2;
  const radius = size * 0.4;
  
  // Draw circle outline
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  // Hour hand (pointing up)
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center, center - radius * 0.5);
  ctx.stroke();
  
  // Minute hand (pointing right)
  ctx.beginPath();
  ctx.moveTo(center, center);
  ctx.lineTo(center + radius * 0.4, center);
  ctx.stroke();
  
  // Center dot
  ctx.beginPath();
  ctx.arc(center, center, ctx.lineWidth * 0.7, 0, Math.PI * 2);
  ctx.fill();
  
  return img.toBuffer('image/png');
}

try {
  // Check if canvas is available
  const icon22 = createClockIcon(22);
  const icon44 = createClockIcon(44);
  
  fs.writeFileSync('tray-iconTemplate.png', icon22);
  fs.writeFileSync('tray-iconTemplate@2x.png', icon44);
  
  console.log('✅ Icons created successfully');
} catch (e) {
  console.log('Canvas not available, using alternative method...');
  // Fallback: copy from existing or use a different method
  console.log('Error:', e.message);
}
