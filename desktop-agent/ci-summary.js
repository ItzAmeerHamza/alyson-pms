#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function findSummaries(root) {
  const files = walk(root).filter(f => /test-summary\.json$/i.test(f));
  return files.map(f => ({ file: f, json: safeReadJson(f) })).filter(x => x.json);
}

function safeReadJson(f) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function detectPlatformFromPath(p) {
  const lc = p.toLowerCase();
  if (lc.includes('windows')) return 'Windows';
  if (lc.includes('macos')) return 'macOS';
  if (lc.includes('linux')) return 'Linux';
  return 'Unknown';
}

function main() {
  const artifactsDir = path.resolve(process.cwd(), 'test-artifacts');
  if (!fs.existsSync(artifactsDir)) {
    console.log('## 🧪 Cross-Platform Test Results Summary');
    console.log('No artifacts found.');
    return;
  }
  const summaries = findSummaries(artifactsDir);
  const byPlatform = new Map();
  for (const { file, json } of summaries) {
    const platform = json.platform || detectPlatformFromPath(file);
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform).push({ file, json });
  }

  console.log('## 🧪 Cross-Platform Test Results Summary');
  console.log('');
  console.log('### 📊 Test Status by Platform');
  console.log('');
  console.log('| Platform | Runs | Passed | Failed | Skipped | Total |');
  console.log('|----------|------|--------|--------|---------|-------|');
  for (const [platform, items] of byPlatform.entries()) {
    let passed = 0, failed = 0, skipped = 0, total = 0;
    for (const it of items) {
      const s = it.json.summary || it.json;
      passed += s.passed || 0;
      failed += s.failed || 0;
      skipped += s.skipped || 0;
      total += s.total || 0;
    }
    console.log(`| ${platform} | ${items.length} | ${passed} | ${failed} | ${skipped} | ${total} |`);
  }
  console.log('');
  console.log('### 📁 Artifacts Available');
  for (const [platform, items] of byPlatform.entries()) {
    console.log(`- ${platform}: ${items.length} summaries`);
  }
  console.log('');
  console.log('### 🔍 Next Steps');
  console.log('1. Download test artifacts for detailed analysis');
  console.log('2. Review platform-specific test results');
  console.log('3. Address any platform-specific issues');
  console.log('4. Verify cross-platform compatibility');
}

main();


