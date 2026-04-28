import { writeFileSync } from 'fs';

// Create a simple black-on-transparent PNG using raw data
function createBlackIcon(size) {
  const pixels = [];
  
  // Create transparent background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Circle outline
      const inCircle = dist >= size * 0.35 && dist <= size * 0.42;
      // Hour hand (vertical line)
      const inHourHand = Math.abs(dx) < 1 && dy >= -size * 0.2 && dy <= 0;
      // Minute hand (horizontal line)
      const inMinHand = Math.abs(dy) < 1 && dx >= 0 && dx <= size * 0.25;
      // Center dot
      const inCenter = dist <= size * 0.08;
      
      if (inCircle || inHourHand || inMinHand || inCenter) {
        pixels.push(0, 0, 0, 255); // Black, opaque
      } else {
        pixels.push(0, 0, 0, 0); // Transparent
      }
    }
  }
  
  // Simple PNG header for 22x22 or 44x44 RGBA
  // This is a minimal valid PNG structure
  const pngData = Buffer.from(pixels);
  
  // For now, let's use a simpler approach - create via ImageMagick or similar
  return pngData;
}

// We'll use Node.js canvas or another approach
console.log('Creating icon via alternative method...');
