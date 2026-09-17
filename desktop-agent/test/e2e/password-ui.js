/**
 * Drive the running desktop agent over CDP (port 9222).
 *
 * Does not send a real reset email and does not start tracking.
 *
 *   node test/e2e/password-ui.js
 */

const http = require('http');
const WebSocket = require('ws');

const CDP_PORT = 9222;
const results = { passed: [], failed: [] };

function pass(name) {
  results.passed.push(name);
  console.log(`PASS  ${name}`);
}
function fail(name, reason) {
  results.failed.push({ name, reason: String(reason) });
  console.log(`FAIL  ${name} -- ${reason}`);
}

function getPageTarget() {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const page = JSON.parse(data).find((t) => t.type === 'page');
            if (page?.webSocketDebuggerUrl) resolve(page);
            else reject(new Error('No page target'));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function cdpEval(wsUrl, expression, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('CDP eval timeout'));
    }, timeout);
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    ws.on('message', (msg) => {
      const parsed = JSON.parse(msg.toString());
      if (parsed.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (parsed.result?.exceptionDetails) {
        reject(
          new Error(
            parsed.result.exceptionDetails.text ||
              parsed.result.exceptionDetails.exception?.description ||
              'JS exception',
          ),
        );
        return;
      }
      resolve(parsed.result?.result?.value);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const page = await getPageTarget();
  const wsUrl = page.webSocketDebuggerUrl;
  console.log(`CDP page: ${page.title}`);

  for (let i = 0; i < 20; i += 1) {
    const ready = await cdpEval(
      wsUrl,
      `Boolean(document.getElementById('forgotPasswordLink') && document.getElementById('changePasswordBtn') && document.getElementById('forgotPasswordModal'))`,
    );
    if (ready) break;
    await sleep(500);
  }

  const snapshot = await cdpEval(
    wsUrl,
    `(() => {
      const disp = (id) => {
        const el = document.getElementById(id);
        if (!el) return 'missing';
        return window.getComputedStyle(el).display;
      };
      return {
        loginDisplay: disp('loginContainer'),
        appDisplay: disp('appContainer'),
        forgotLink: Boolean(document.getElementById('forgotPasswordLink')),
        changeBtn: Boolean(document.getElementById('changePasswordBtn')),
        newPwForm: Boolean(document.getElementById('newPasswordForm')),
        forgotModal: Boolean(document.getElementById('forgotPasswordModal')),
        changeModal: Boolean(document.getElementById('changePasswordModal')),
        updateGate: Boolean(window.__updateGateActive),
        userName: document.getElementById('userName')?.textContent || '',
      };
    })()`,
  );

  if (snapshot.forgotLink) pass('login Forgot password? control exists');
  else fail('login Forgot password? control exists', 'missing #forgotPasswordLink');
  if (snapshot.changeBtn) pass('sidebar Change Password control exists');
  else fail('sidebar Change Password control exists', 'missing #changePasswordBtn');
  if (snapshot.newPwForm) pass('first-login set-password form exists');
  else fail('first-login set-password form exists', 'missing #newPasswordForm');
  if (snapshot.forgotModal) pass('reset password modal exists');
  else fail('reset password modal exists', 'missing #forgotPasswordModal');
  if (!snapshot.updateGate) pass('update gate is not blocking');
  else fail('update gate is not blocking', 'mandatory update gate is up');

  const appVisible = snapshot.appDisplay !== 'none';
  const loginVisible = snapshot.loginDisplay !== 'none';

  if (appVisible) {
    pass(`signed-in UI visible (${snapshot.userName || 'user'})`);
    await cdpEval(
      wsUrl,
      `document.getElementById('changePasswordBtn').click(); true`,
    );
    await sleep(300);
    const changeOpen = await cdpEval(
      wsUrl,
      `(() => {
        const modal = document.getElementById('changePasswordModal');
        return Boolean(modal && modal.classList.contains('visible') && !modal.hidden);
      })()`,
    );
    if (changeOpen) pass('Change Password modal opens');
    else fail('Change Password modal opens', 'modal not visible');

    const forgotInChange = await cdpEval(
      wsUrl,
      `Boolean(document.getElementById('forgotFromChangeBtn'))`,
    );
    if (forgotInChange) pass('Forgot password? exists on Change Password');
    else fail('Forgot password? exists on Change Password', 'missing button');

    await cdpEval(
      wsUrl,
      `(() => {
        document.getElementById('currentPassword').value = 'OldPass12!';
        document.getElementById('changeNewPassword').value = 'weak';
        document.getElementById('changeConfirmPassword').value = 'weak';
        document.getElementById('changePasswordForm').requestSubmit();
        return true;
      })()`,
    );
    await sleep(400);
    const weakError = await cdpEval(
      wsUrl,
      `document.getElementById('changePasswordError')?.textContent || ''`,
    );
    if (/8 or more|mix of uppercase|symbol/i.test(weakError)) {
      pass('weak password is rejected in Change Password');
    } else {
      fail('weak password is rejected in Change Password', weakError || 'no error');
    }

    await cdpEval(wsUrl, `document.getElementById('changePasswordCancelBtn').click(); true`);
    await sleep(200);

    await cdpEval(wsUrl, `document.getElementById('forgotPasswordLink').click(); true`);
    await sleep(400);
    const forgotOpen = await cdpEval(
      wsUrl,
      `(() => {
        const modal = document.getElementById('forgotPasswordModal');
        return {
          open: Boolean(modal && modal.classList.contains('visible') && !modal.hidden),
          email: document.getElementById('forgotEmail')?.value || '',
          sendDisabled: Boolean(document.getElementById('forgotSendCodeBtn')?.disabled),
        };
      })()`,
    );
    if (forgotOpen.open) pass('Forgot password modal opens from login control');
    else fail('Forgot password modal opens from login control', JSON.stringify(forgotOpen));
    if (forgotOpen.email) pass(`reset email prefills (${forgotOpen.email})`);
    else fail('reset email prefills', 'email field empty');

    await cdpEval(
      wsUrl,
      `document.getElementById('forgotRequestCancelBtn').click(); true`,
    );
    await sleep(200);
    const closed = await cdpEval(
      wsUrl,
      `!document.getElementById('forgotPasswordModal').classList.contains('visible')`,
    );
    if (closed) pass('Forgot password modal cancels without sending code');
    else fail('Forgot password modal cancels without sending code', 'still visible');
  } else if (loginVisible) {
    pass('login screen visible');
    await cdpEval(wsUrl, `document.getElementById('forgotPasswordLink').click(); true`);
    await sleep(300);
    await cdpEval(
      wsUrl,
      `(() => {
        const email = document.getElementById('forgotEmail');
        if (email) email.value = 'e2e-password-reset@invalid.test';
        document.getElementById('forgotRequestForm').requestSubmit();
        return true;
      })()`,
    );
    await sleep(2500);
    const confirmVisible = await cdpEval(
      wsUrl,
      `(() => {
        const form = document.getElementById('forgotConfirmForm');
        return Boolean(form && !form.hidden && form.style.display !== 'none');
      })()`,
    );
    if (confirmVisible) pass('ghost email still advances to code step');
    else fail('ghost email still advances to code step', 'confirm form hidden');
    await cdpEval(wsUrl, `document.getElementById('forgotRequestCancelBtn')?.click(); document.getElementById('forgotConfirmBackBtn')?.click(); true`);
    await cdpEval(wsUrl, `document.getElementById('forgotPasswordModal') && (window.moduleInstances?.authManager?.closeForgotPasswordModal?.(), true)`);
  } else {
    fail('app or login visible', JSON.stringify(snapshot));
  }

  console.log('');
  console.log(`Passed ${results.passed.length}  Failed ${results.failed.length}`);
  if (results.failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
