'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavilo-prefs-'));
const mockLoginSettings = { wasOpenedAtLogin: false };

jest.mock(
  'electron',
  () => ({
    app: {
      getPath: () => mockTmpDir,
      getLoginItemSettings: () => mockLoginSettings,
    },
  }),
  { virtual: true },
);

const prefs = require('../user-preferences');
const file = path.join(mockTmpDir, 'user-preferences.json');

describe('user-preferences', () => {
  beforeEach(() => {
    prefs._resetForTests();
    try { fs.unlinkSync(file); } catch (_) { /* none yet */ }
    mockLoginSettings.wasOpenedAtLogin = false;
  });

  afterAll(() => fs.rmSync(mockTmpDir, { recursive: true, force: true }));

  test('defaults keep today’s behavior', () => {
    expect(prefs.getAll()).toEqual({
      openWindowAtLogin: true,
      showMenuBarTimer: true,
      notTrackingReminderMinutes: 10,
      desktopNotifications: true,
    });
  });

  test('update saves to disk and survives a reload', () => {
    prefs.update({ desktopNotifications: false, notTrackingReminderMinutes: 30 });
    prefs._resetForTests();
    expect(prefs.get('desktopNotifications')).toBe(false);
    expect(prefs.get('notTrackingReminderMinutes')).toBe(30);
    expect(prefs.get('showMenuBarTimer')).toBe(true);
  });

  test('bad values fall back to defaults', () => {
    fs.writeFileSync(file, JSON.stringify({
      notTrackingReminderMinutes: 7,
      showMenuBarTimer: 'no',
      somethingElse: 1,
    }));
    expect(prefs.getAll()).toEqual(prefs.DEFAULTS);
  });

  test('reminder can be turned off with 0', () => {
    prefs.update({ notTrackingReminderMinutes: 0 });
    expect(prefs.get('notTrackingReminderMinutes')).toBe(0);
  });

  describe('shouldStartHidden', () => {
    test('normal launch always shows the window', () => {
      prefs.update({ openWindowAtLogin: false });
      prefs._resetForTests();
      expect(prefs.shouldStartHidden()).toBe(false);
    });

    test('login launch with the window setting on still shows it', () => {
      process.argv.push(prefs.LOGIN_ARG);
      try {
        expect(prefs.shouldStartHidden()).toBe(false);
      } finally {
        process.argv.pop();
      }
    });

    test('login launch (Windows flag) with the setting off starts hidden', () => {
      prefs.update({ openWindowAtLogin: false });
      process.argv.push(prefs.LOGIN_ARG);
      try {
        expect(prefs.shouldStartHidden()).toBe(true);
      } finally {
        process.argv.pop();
      }
    });

    test('macOS login launch is detected from Electron', () => {
      const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        mockLoginSettings.wasOpenedAtLogin = true;
        expect(prefs.wasOpenedAtLogin([])).toBe(true);
        mockLoginSettings.wasOpenedAtLogin = false;
        expect(prefs.wasOpenedAtLogin([])).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', realPlatform);
      }
    });
  });
});
