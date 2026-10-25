/**
 * Settings page: personal preferences only.
 * Tracking rules (screenshots, idle, intervals) stay with the workspace admin.
 *
 * - Start at login        → get/set-auto-launch (main process login item)
 * - Open window at login,
 *   start reminder, notifications,
 *   menu bar timer        → get/set-user-preferences
 * - Closing window        → get/set-close-behavior (Windows/Linux prompt on X)
 * - Theme                 → uses the existing [data-theme-option] buttons, which
 *                           index.html already wires to window.applyAlysonTheme
 */

let bound = false;
// Same custom dropdown as Report an issue / Screenshots, not the OS menu.
let reminderDropdown = null;
// Last saved reminder value, to put back if a save fails.
let lastReminder = null;

function mountReminderDropdown(select) {
  if (!select || reminderDropdown) return;
  try {
    const { ProjectDropdown } = require('./project-dropdown');
    reminderDropdown = new ProjectDropdown(select, {
      search: false,
      skipEmpty: false,
      placeholder: select.options?.[select.selectedIndex]?.textContent?.trim() || 'Every 10 minutes',
    });
    reminderDropdown.mount();
  } catch (_) {
    reminderDropdown = null; // native select still works
  }
}

/** Set the reminder value from code and keep the custom dropdown's label in step. */
function setReminderValue(select, value) {
  if (!select) return;
  select.value = String(value);
  try { reminderDropdown?.syncFromSelect?.(); } catch (_) { /* ignore */ }
}

function els() {
  const $ = (id) => document.getElementById(id);
  return {
    autoLaunch: $('settingsAutoLaunch'),
    autoLaunchStatus: $('settingsAutoLaunchStatus'),
    openWindow: $('settingsOpenWindow'),
    openWindowStatus: $('settingsOpenWindowStatus'),
    reminder: $('settingsReminder'),
    reminderStatus: $('settingsReminderStatus'),
    notifications: $('settingsNotifications'),
    notificationsStatus: $('settingsNotificationsStatus'),
    menuBarRow: $('settingsMenuBarTimerRow'),
    menuBar: $('settingsMenuBarTimer'),
    menuBarStatus: $('settingsMenuBarTimerStatus'),
    closeRow: $('settingsCloseRow'),
    closeAsk: $('settingsCloseAsk'),
    closeMinimize: $('settingsCloseMinimize'),
    closeStatus: $('settingsCloseStatus'),
  };
}

function flash(statusEl, text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', isError);
  clearTimeout(statusEl._t);
  statusEl._t = setTimeout(() => { statusEl.textContent = ''; }, isError ? 6000 : 2500);
}

/** "Open the window" only matters when the app starts at sign-in. */
function syncOpenWindowEnabled(e) {
  if (e.openWindow && e.autoLaunch) e.openWindow.disabled = !e.autoLaunch.checked;
}

/** macOS: show whether Screen Recording and Accessibility are granted. */
async function loadPermissionStatus(ipcRenderer) {
  if (process.platform !== 'darwin') return;
  const show = (role, granted) => {
    const el = document.querySelector(`[data-perm-status="${role}"]`);
    if (!el) return;
    el.textContent = granted ? 'Allowed' : 'Not allowed — click Open settings and turn on Tavilo Time';
    el.classList.toggle('is-ok', !!granted);
    el.classList.toggle('is-missing', !granted);
  };
  try {
    const res = await ipcRenderer.invoke('check-permissions');
    const ok = (v) => v === true || v === 'granted' || v === 'authorized';
    show('screen', ok(res?.screen));
    show('access', ok(res?.accessibility));
  } catch (_) { /* leave blank when the check is unavailable */ }
}

async function load(ipcRenderer) {
  const e = els();
  loadPermissionStatus(ipcRenderer);

  try {
    const res = await ipcRenderer.invoke('get-auto-launch');
    if (e.autoLaunch) e.autoLaunch.checked = res?.enabled !== false;
  } catch (_) {
    if (e.autoLaunch) e.autoLaunch.checked = true;
  }

  try {
    const res = await ipcRenderer.invoke('get-user-preferences');
    const p = res?.preferences || {};
    if (e.openWindow) e.openWindow.checked = p.openWindowAtLogin !== false;
    if (e.notifications) e.notifications.checked = p.desktopNotifications !== false;
    if (e.menuBar) e.menuBar.checked = p.showMenuBarTimer !== false;
    if (e.menuBarRow) e.menuBarRow.hidden = !res?.supports?.menuBarTimer;
    if (e.reminder) {
      const mins = Number.isFinite(p.notTrackingReminderMinutes) ? p.notTrackingReminderMinutes : 10;
      setReminderValue(e.reminder, mins);
      lastReminder = String(mins);
    }
  } catch (_) {
    if (e.menuBarRow) e.menuBarRow.hidden = true;
  }
  syncOpenWindowEnabled(e);

  try {
    const res = await ipcRenderer.invoke('get-close-behavior');
    const supported = !!res?.supported;
    if (e.closeRow) e.closeRow.hidden = !supported;
    if (supported) {
      const ask = res.askOnClose !== false;
      if (e.closeAsk) e.closeAsk.checked = ask;
      if (e.closeMinimize) e.closeMinimize.checked = !ask;
    }
  } catch (_) {
    if (e.closeRow) e.closeRow.hidden = true;
  }
}

/** Save one preference; on failure put the control back and show an error. */
async function savePref(ipcRenderer, partial, statusEl, okText, revert) {
  try {
    const res = await ipcRenderer.invoke('set-user-preferences', partial);
    if (res?.success === false) throw new Error(res.error || 'failed');
    flash(statusEl, okText);
  } catch (_) {
    revert();
    flash(statusEl, 'Couldn’t save — please try again', true);
  }
}

function bindSwitch(ipcRenderer, input, statusEl, key, onText, offText) {
  input?.addEventListener('change', async () => {
    const want = input.checked;
    input.disabled = true;
    await savePref(ipcRenderer, { [key]: want }, statusEl, want ? onText : offText, () => {
      input.checked = !want;
    });
    input.disabled = false;
    syncOpenWindowEnabled(els());
  });
}

function bind(ipcRenderer) {
  if (bound) return;
  bound = true;
  const e = els();

  e.autoLaunch?.addEventListener('change', async () => {
    const want = e.autoLaunch.checked;
    e.autoLaunch.disabled = true;
    try {
      const res = await ipcRenderer.invoke('set-auto-launch', want);
      if (res?.success === false) throw new Error(res.error || 'failed');
      flash(e.autoLaunchStatus, want ? 'Will start when you sign in' : 'Won’t start automatically');
    } catch (_) {
      e.autoLaunch.checked = !want;
      flash(e.autoLaunchStatus, 'Couldn’t save — please try again', true);
    } finally {
      e.autoLaunch.disabled = false;
      syncOpenWindowEnabled(e);
    }
  });

  bindSwitch(ipcRenderer, e.openWindow, e.openWindowStatus, 'openWindowAtLogin',
    'The window will open at sign-in', 'Will start in the background');
  bindSwitch(ipcRenderer, e.notifications, e.notificationsStatus, 'desktopNotifications',
    'Notifications on', 'Notifications off');
  bindSwitch(ipcRenderer, e.menuBar, e.menuBarStatus, 'showMenuBarTimer',
    'Timer shown in the menu bar', 'Timer hidden from the menu bar');

  mountReminderDropdown(e.reminder);
  if (lastReminder == null) lastReminder = e.reminder?.value ?? null;
  e.reminder?.addEventListener('change', async () => {
    const mins = Number(e.reminder.value);
    const previous = lastReminder;
    await savePref(
      ipcRenderer,
      { notTrackingReminderMinutes: mins },
      e.reminderStatus,
      mins > 0 ? 'Saved' : 'Reminders turned off',
      () => { setReminderValue(e.reminder, previous); },
    );
    lastReminder = e.reminder.value;
  });

  const onClose = async () => {
    const ask = !!e.closeAsk?.checked;
    try {
      const res = await ipcRenderer.invoke('set-close-behavior', ask);
      if (res?.success === false) throw new Error(res.error || 'failed');
      flash(e.closeStatus, 'Saved');
    } catch (_) {
      flash(e.closeStatus, 'Couldn’t save — please try again', true);
      load(ipcRenderer);
    }
  };
  e.closeAsk?.addEventListener('change', onClose);
  e.closeMinimize?.addEventListener('change', onClose);
}

/** Called each time the Settings page opens, so values reflect tray changes. */
function initSettingsPage(ipcRenderer) {
  bind(ipcRenderer);
  return load(ipcRenderer);
}

module.exports = { initSettingsPage };
