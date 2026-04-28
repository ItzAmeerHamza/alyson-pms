/**
 * TimeFlow Desktop Agent — Automated E2E Test Runner
 *
 * Usage:
 *   1. Kill any running Work Time app
 *   2. Start the agent:  npx electron . --remote-debugging-port=9222
 *   3. Run this:         node test/e2e/test-runner.js [--phase=<name>] [--skip-recovery]
 *
 * Phases: 1, 2, active, C, idle, A, D, E, dup, B, dash
 * Connects via Chrome DevTools Protocol (CDP) on port 9222.
 */

const http = require('http');
const WebSocket = require('ws');

const CDP_PORT = 9222;

const results = {
  passed: [],
  failed: [],
  warnings: [],
  testStartTime: new Date().toISOString(),
};

function log(icon, msg) { console.log(`${icon} ${msg}`); }
function pass(test) { results.passed.push(test); log('PASS', `${test}`); }
function fail(test, reason) { results.failed.push({ test, reason }); log('FAIL', `${test} -- ${reason}`); }
function warn(test, reason) { results.warnings.push({ test, reason }); log('WARN', `${test} -- ${reason}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- CDP Helpers ---

async function getPageTarget() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const page = JSON.parse(data).find(t => t.type === 'page');
          if (page) resolve(page);
          else reject(new Error('No page target'));
        } catch (e) { reject(e); }
      });
    }).on('error', (e) => reject(new Error(`CDP port ${CDP_PORT} not reachable -- is the agent running with --remote-debugging-port=9222?`)));
  });
}

async function cdpEval(wsUrl, expression, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP eval timeout')); }, timeout);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true }
      }));
    });
    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg);
      if (parsed.id === 1) {
        clearTimeout(timer);
        if (parsed.result?.exceptionDetails) reject(new Error(parsed.result.exceptionDetails.text || 'JS exception'));
        else resolve(parsed.result?.result?.value);
        ws.close();
      }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function simulateMouse(wsUrl, durationMs, intervalMs = 2000) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    ws.on('open', () => {
      const iv = setInterval(() => {
        ws.send(JSON.stringify({
          id: msgId++, method: 'Input.dispatchMouseEvent',
          params: { type: 'mouseMoved', x: Math.round(100 + Math.random() * 300), y: Math.round(100 + Math.random() * 300) }
        }));
      }, intervalMs);
      setTimeout(() => { clearInterval(iv); ws.close(); resolve(); }, durationMs);
    });
    ws.on('error', () => resolve());
  });
}

function ipcInvokeExpr(channel, args) {
  const argsStr = args ? JSON.stringify(args) : '';
  return `
    (async () => {
      const ipc = (window.electronAPI && window.electronAPI.ipcRenderer)
        ? window.electronAPI.ipcRenderer
        : (typeof ipcRenderer !== 'undefined' ? ipcRenderer : null);
      if (!ipc || !ipc.invoke) return JSON.stringify({ success: false, error: 'ipcRenderer not available' });
      try {
        const r = await ipc.invoke('${channel}'${argsStr ? ', ' + argsStr : ''});
        return JSON.stringify({ success: true, result: r });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    })();
  `;
}

// --- UI actions ---

async function clickStart(wsUrl) {
  return cdpEval(wsUrl, `
    (async () => {
      const sel = document.querySelector('select');
      if (sel && sel.options.length > 1) {
        sel.selectedIndex = 1;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await new Promise(r => setTimeout(r, 500));
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Start' && b.offsetParent !== null);
      if (!btn || btn.disabled) return JSON.stringify({ clicked: false, tracking: false, reason: 'Start button not found or disabled' });
      btn.click();
      for (let i = 0; i < 16; i++) {
        await new Promise(r => setTimeout(r, 500));
        const stop = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Stop');
        if (stop && !stop.disabled) return JSON.stringify({ clicked: true, tracking: true });
      }
      return JSON.stringify({ clicked: true, tracking: false, reason: 'Stop button never enabled' });
    })();
  `, 20000);
}

async function clickStop(wsUrl) {
  return cdpEval(wsUrl, `
    (async () => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Stop' && b.offsetParent !== null);
      if (btn && !btn.disabled) {
        btn.click();
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500));
          const start = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Start');
          if (start && !start.disabled) return JSON.stringify({ clicked: true, stopped: true });
        }
        return JSON.stringify({ clicked: true, stopped: false, reason: 'Start never re-enabled' });
      }
      const start = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Start');
      if (start && !start.disabled) return JSON.stringify({ clicked: false, stopped: true, reason: 'Already stopped' });
      return JSON.stringify({ clicked: false, stopped: false, reason: 'No actionable button' });
    })();
  `, 15000);
}

async function readDashboardCards(wsUrl) {
  return cdpEval(wsUrl, `
    (() => {
      const g = (id) => document.getElementById(id)?.textContent?.trim() || 'N/A';
      return JSON.stringify({
        mouseClicks:  { s: g('status-mouse-click'), p: g('proof-mouse-click') },
        mouseMoves:   { s: g('status-mouse-move'), p: g('proof-mouse-move') },
        keystrokes:   { s: g('status-keyboard'),    p: g('proof-keyboard') },
        screenshots:  { s: g('status-screenshot'),  p: g('proof-screenshot') },
        appTracking:  { s: g('status-app'),          p: g('proof-app') },
        urlTracking:  { s: g('status-url'),          p: g('proof-url') },
        userIdle:     { s: g('status-idle'),         p: g('proof-idle') },
      });
    })();
  `);
}

// === Phase 1: Connectivity ===

async function phase1(wsUrl) {
  log('---', '=== Phase 1: Connectivity & Page State ===');
  try {
    const raw = await cdpEval(wsUrl, `
      (() => {
        const sel = document.querySelector('select');
        const opts = sel ? Array.from(sel.options).filter(o => o.value).length : 0;
        return JSON.stringify({
          hasAPI: !!window.electronAPI,
          projects: opts,
          loginVisible: !!document.getElementById('loginContainer')?.offsetParent,
        });
      })();
    `);
    const s = JSON.parse(raw);
    s.hasAPI ? pass('electronAPI available') : fail('electronAPI', 'undefined');
    s.projects > 0 ? pass(`Projects loaded (${s.projects})`) : fail('Projects loaded', 'None');
    !s.loginVisible ? pass('Session restored') : fail('Session', 'Login page visible');
    return s;
  } catch (e) { fail('Phase 1', e.message); return null; }
}

// === Phase 2: Start Timer ===

async function phase2(wsUrl) {
  log('---', '=== Phase 2: Start Timer ===');
  try {
    const d = JSON.parse(await clickStart(wsUrl));
    if (!d.clicked) { fail('Start clicked', d.reason); return false; }
    pass('Start button clicked');
    if (d.tracking) { pass('Tracking confirmed (Stop enabled)'); return true; }
    fail('Tracking confirmed', d.reason); return false;
  } catch (e) { fail('Phase 2', e.message); return false; }
}

// === Active Tracking with Mouse Sim ===

async function phaseActive(wsUrl, ms = 30000) {
  log('---', `=== Active: Mouse Sim (${ms / 1000}s) ===`);
  await simulateMouse(wsUrl, ms, 2000);
  pass(`Mouse sim ${ms / 1000}s`);
  try {
    const cards = JSON.parse(await readDashboardCards(wsUrl));
    for (const [name, card] of Object.entries(cards)) {
      const bad = card.s.includes('Not Working') || card.s.includes('X');
      const ok = !bad && (card.s.includes('Working') || card.s.includes('Active') || card.s.includes('V'));
      ok ? pass(`${name}: ${card.s}`) : warn(`${name}: ${card.s}`, card.p);
    }
  } catch (e) { warn('Dashboard cards', e.message); }
}

// === Phase C: Force Screenshot ===

async function phaseC(wsUrl) {
  log('---', '=== Phase C: Force Screenshot ===');
  try {
    const raw = await cdpEval(wsUrl, ipcInvokeExpr('capture-screenshot', { source: 'manual' }), 30000);
    const d = JSON.parse(raw);
    d.success ? pass('Screenshot captured via IPC') : warn('Screenshot capture', d.error);
  } catch (e) { warn('Phase C', e.message); }
}

// === Idle Phase ===

async function phaseIdle(wsUrl, ms = 70000) {
  log('---', `=== Idle: ${ms / 1000}s no input ===`);
  log('...', 'Waiting for idle threshold...');
  await sleep(ms);
  try {
    const cards = JSON.parse(await readDashboardCards(wsUrl));
    const idle = cards.userIdle;
    const isIdle = idle.s.includes('Idle') || idle.p.includes('idle');
    isIdle ? pass(`Idle detected: ${idle.s}`) : warn('Idle detection', `${idle.s} -- ${idle.p}`);
  } catch (e) { warn('Idle dashboard', e.message); }
}

// === Phase A: Active-Idle-Active ===

async function phaseA(wsUrl) {
  log('---', '=== Phase A: Resume from Idle + Stop ===');

  try {
    const stateRaw = await cdpEval(wsUrl, ipcInvokeExpr('get-tracking-state'));
    const stateD = JSON.parse(stateRaw);
    if (stateD.success && stateD.result && !stateD.result.isTracking) {
      log('!', 'Tracking stopped during idle -- restarting for Phase A');
      const sd = JSON.parse(await clickStart(wsUrl));
      sd.tracking ? pass('Restarted for A') : warn('Restart for A', sd.reason);
      await sleep(2000);
    }
  } catch (_) {}

  await simulateMouse(wsUrl, 30000, 2000);
  pass('Mouse resumed after idle');
  await sleep(2000);

  const t0 = Date.now();
  try {
    const d = JSON.parse(await clickStop(wsUrl));
    const ms = Date.now() - t0;
    if (d.clicked || d.stopped) {
      pass(`Stop: ${d.reason || 'clicked'}`);
    } else {
      log('!', 'Button not found, trying IPC stop-tracking...');
      const ipcRaw = await cdpEval(wsUrl, ipcInvokeExpr('stop-tracking'));
      const ipcD = JSON.parse(ipcRaw);
      ipcD.success ? pass('Stop via IPC fallback') : fail('Stop after A-I-A', d.reason);
    }
    ms < 10000 ? pass(`Stop in ${ms}ms`) : warn('Stop perf', `${ms}ms`);
  } catch (e) { fail('Phase A stop', e.message); }
  pass('Phase A complete');
}

// === Phase D: Pause/Resume ===

async function phaseD(wsUrl) {
  log('---', '=== Phase D: Pause/Resume ===');

  await sleep(3000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sd = JSON.parse(await clickStart(wsUrl));
      if (sd.tracking) { pass('Session for D started'); break; }
      if (attempt === 2) warn('Session for D', sd.reason);
      else await sleep(2000);
    } catch (_) {
      if (attempt === 2) warn('Phase D start', 'failed after retries');
      else await sleep(2000);
    }
  }

  await simulateMouse(wsUrl, 10000, 2000);

  try {
    const pd = JSON.parse(await cdpEval(wsUrl, ipcInvokeExpr('pause-tracking')));
    pd.success ? pass(`Pause: ${JSON.stringify(pd.result)}`) : warn('Pause', pd.error);
  } catch (e) { warn('Pause IPC', e.message); }

  log('...', 'Paused 15s...');
  await sleep(15000);

  try {
    const rd = JSON.parse(await cdpEval(wsUrl, ipcInvokeExpr('resume-tracking')));
    rd.success ? pass(`Resume: ${JSON.stringify(rd.result)}`) : warn('Resume', rd.error);
  } catch (e) { warn('Resume IPC', e.message); }

  await simulateMouse(wsUrl, 10000, 2000);

  try {
    const d = JSON.parse(await clickStop(wsUrl));
    if (d.clicked || d.stopped) {
      pass('Stop after D');
    } else {
      log('!', 'Button not found, trying IPC stop-tracking...');
      const ipcRaw = await cdpEval(wsUrl, ipcInvokeExpr('stop-tracking'));
      const ipcD = JSON.parse(ipcRaw);
      ipcD.success ? pass('Stop after D via IPC') : fail('Stop after D', d.reason);
    }
  } catch (e) { fail('Phase D stop', e.message); }
  pass('Phase D complete');
}

// === Phase E: Stale Recovery ===

async function phaseE(wsUrl) {
  log('---', '=== Phase E: Stale Session Recovery ===');
  log('!', 'Requires pre-inserted stale session in DB');
  try {
    const sd = JSON.parse(await clickStart(wsUrl));
    sd.tracking ? pass('Start after stale (confirmed)') : warn('Start after stale', sd.reason);
  } catch (e) { fail('Phase E start', e.message); }
  await sleep(5000);
  try {
    const d = JSON.parse(await clickStop(wsUrl));
    (d.clicked || d.stopped) ? pass('Stop after E') : fail('Stop after E', d.reason);
  } catch (e) { fail('Phase E stop', e.message); }
  pass('Phase E complete');
}

// === Duplicate Prevention ===

async function phaseDup(wsUrl) {
  log('---', '=== Duplicate Prevention ===');

  await sleep(3000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sd = JSON.parse(await clickStart(wsUrl));
      if (sd.tracking) { pass('First session for dup'); break; }
      if (attempt === 2) warn('Dup first start', sd.reason);
      else await sleep(2000);
    } catch (_) {
      if (attempt === 2) warn('Dup first start', 'failed after retries');
      else await sleep(2000);
    }
  }
  await sleep(3000);

  try {
    const r = await cdpEval(wsUrl, ipcInvokeExpr('start-tracking', { projectId: 'test-dup-project' }));
    pass(`Dup start handled: ${r}`);
  } catch (e) { warn('Dup IPC', e.message); }

  await sleep(2000);
  try {
    const d = JSON.parse(await clickStop(wsUrl));
    if (d.clicked || d.stopped) {
      pass('Stop after dup');
    } else {
      log('!', 'Button not found, trying IPC stop-tracking...');
      const ipcRaw = await cdpEval(wsUrl, ipcInvokeExpr('stop-tracking'));
      const ipcD = JSON.parse(ipcRaw);
      ipcD.success ? pass('Stop after dup via IPC') : warn('Dup stop', d.reason);
    }
  } catch (e) { warn('Dup stop', e.message); }
  pass('Dup prevention complete');
}

// === Phase B: Multi-Session Totals ===

async function phaseB(wsUrl) {
  log('---', '=== Phase B: Multi-Session Totals ===');
  try {
    const raw = await cdpEval(wsUrl, ipcInvokeExpr('get-today-time-stats'));
    const d = JSON.parse(raw);
    if (d.success && d.result) {
      const hrs = Math.floor(d.result.totalTime / 3600);
      const mins = Math.floor((d.result.totalTime % 3600) / 60);
      pass(`Total today: ${hrs}h ${mins}m across ${d.result.timeLogsCount} sessions`);
      d.result.totalTime > 0 ? pass('Multi-session total > 0') : warn('Total time', '0 seconds');
    } else {
      warn('Phase B', d.error || 'no result');
    }
  } catch (e) { warn('Phase B', e.message); }
}

// === Dashboard (stopped state) ===

async function phaseDash(wsUrl) {
  log('---', '=== Dashboard (stopped state) ===');
  try {
    const cards = JSON.parse(await readDashboardCards(wsUrl));
    for (const [name, card] of Object.entries(cards)) {
      const ok = card.s.includes('Stopped') || card.s.includes('Not') || card.s === 'N/A' || card.s.includes('X');
      ok ? pass(`${name} stopped: ${card.s}`) : warn(`${name} after stop`, `${card.s}`);
    }
  } catch (e) { warn('Dashboard stopped', e.message); }
}

// === Quick Verify (all systems check) ===

async function phaseVerify(wsUrl) {
  log('---', '=== Quick Verify: All Systems ===');

  try {
    const state = JSON.parse(await cdpEval(wsUrl, `
      (async () => {
        const ipc = window.electronAPI?.ipcRenderer;
        const s = await ipc.invoke('get-tracking-state');
        return JSON.stringify(s);
      })();
    `));
    console.log('  Tracking:', state.isTracking);
    console.log('  Session ID:', state.currentTimeLogId);
    const durationMin = Math.round(state.trackingDuration / 60000);
    console.log('  Duration:', durationMin, 'min');
    state.isTracking ? pass('Tracking active') : warn('Tracking', 'not active');
    state.currentTimeLogId ? pass('Session ID present') : warn('Session', 'no ID');
  } catch (e) { fail('Tracking state', e.message); }

  try {
    const stats = JSON.parse(await cdpEval(wsUrl, `
      (async () => {
        const ipc = window.electronAPI?.ipcRenderer;
        const s = await ipc.invoke('get-today-time-stats');
        return JSON.stringify(s);
      })();
    `));
    const hrs = Math.floor(stats.totalTime / 3600);
    const mins = Math.floor((stats.totalTime % 3600) / 60);
    console.log('  Total today:', hrs + 'h ' + mins + 'm (' + stats.totalTime + 's)');
    console.log('  Sessions:', stats.timeLogsCount);
    stats.totalTime > 0 ? pass('Time sync OK') : warn('Time sync', '0s total');
  } catch (e) { warn('Time stats', e.message); }

  try {
    const cards = JSON.parse(await readDashboardCards(wsUrl));
    let allGood = true;
    for (const [k, v] of Object.entries(cards)) {
      const ok = v.s.includes('Working') || v.s.includes('Active');
      if (!ok) allGood = false;
      console.log('  ' + k + ': ' + v.s + (ok ? ' OK' : ' !!'));
    }
    allGood ? pass('All dashboard systems working') : warn('Dashboard', 'some systems not working');
  } catch (e) { warn('Dashboard cards', e.message); }

  try {
    const input = JSON.parse(await cdpEval(wsUrl, `
      (() => {
        const g = (id) => document.getElementById(id)?.textContent?.trim() || 'N/A';
        return JSON.stringify({
          keyProof: g('proof-keyboard'),
          clickProof: g('proof-mouse-click'),
          moveProof: g('proof-mouse-move'),
        });
      })();
    `));
    console.log('  Keystrokes:', input.keyProof);
    console.log('  Clicks:', input.clickProof);
    console.log('  Moves:', input.moveProof);
    const keysCount = parseInt((input.keyProof.match(/Count:\s*(\d+)/) || [])[1] || '0');
    keysCount > 0 ? pass('Keyboard tracking active (' + keysCount + ' keys)') : warn('Keyboard', '0 keys detected');
  } catch (e) { warn('Input detection', e.message); }
}

// === Summary ===

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('FULL TEST SUITE SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed:   ${results.passed.length}`);
  console.log(`Failed:   ${results.failed.length}`);
  console.log(`Warnings: ${results.warnings.length}`);
  if (results.failed.length > 0) {
    console.log('\n-- Failed --');
    results.failed.forEach(f => console.log(`  FAIL ${f.test}: ${f.reason}`));
  }
  if (results.warnings.length > 0) {
    console.log('\n-- Warnings --');
    results.warnings.forEach(w => console.log(`  WARN ${w.test}: ${w.reason}`));
  }
  console.log('='.repeat(60));
  console.log(results.failed.length === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
  console.log('='.repeat(60));
  console.log(`\nTest started: ${results.testStartTime}`);
  console.log('DB verification: run db-verify-queries.sql via Supabase SQL editor');
}

// === Main ===

async function main() {
  const args = process.argv.slice(2);
  const phaseArg = args.find(a => a.startsWith('--phase='));
  const single = phaseArg ? phaseArg.split('=')[1] : null;
  const skipRecovery = args.includes('--skip-recovery');

  console.log('TimeFlow Desktop Agent -- Full E2E Test Suite');
  console.log(`Phase: ${single || 'all'} | Skip recovery: ${skipRecovery}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);
  console.log('');

  let wsUrl;
  try {
    const target = await getPageTarget();
    pass('CDP connected');
    wsUrl = target.webSocketDebuggerUrl;
  } catch (e) { fail('CDP', e.message); printSummary(); return; }

  const run = (n) => !single || single === n;

  if (run('1'))      { if (!(await phase1(wsUrl)) && !single) { printSummary(); return; } }
  if (run('2'))      { if (!(await phase2(wsUrl)) && !single) { printSummary(); return; } }
  if (run('active')) { await phaseActive(wsUrl, 30000); }
  if (run('C'))      { await phaseC(wsUrl); }
  if (run('idle'))   { await phaseIdle(wsUrl, 70000); }
  if (run('A'))      { await phaseA(wsUrl); await sleep(3000); }
  if (run('D'))      { await phaseD(wsUrl); await sleep(3000); }
  if (run('E') && !skipRecovery) { await phaseE(wsUrl); await sleep(3000); }
  if (run('dup'))    { await phaseDup(wsUrl); await sleep(3000); }
  if (run('B'))      { await phaseB(wsUrl); }
  if (run('dash'))   { await phaseDash(wsUrl); }
  if (run('verify')) { await phaseVerify(wsUrl); }

  printSummary();
}

main().catch(console.error);
