/**
 * Windows rebrand: relaunch must prefer a folder that has ffmpeg.dll,
 * not a stale Alyson PM.exe path left from process.execPath.
 */
const path = require('path');

jest.mock(
  'electron',
  () => ({
    app: null,
    BrowserWindow: null,
    dialog: null,
    ipcMain: null,
    shell: null,
  }),
  { virtual: true },
);

jest.mock('electron-updater', () => ({ autoUpdater: null }), { virtual: true });

const ForceUpdater = require('../force-updater');

describe('Windows relaunch candidates after Tavilo rename', () => {
  it('lists Tavilo Time.exe under Alyson PM and Tavilo Time program folders', () => {
    const prevLocal = process.env.LOCALAPPDATA;
    const prevProfile = process.env.USERPROFILE;
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    process.env.USERPROFILE = 'C:\\Users\\test';

    const updater = new ForceUpdater();
    const list = updater.getWindowsRelaunchCandidates();

    expect(list).toEqual(
      expect.arrayContaining([
        path.join('C:\\Users\\test\\AppData\\Local', 'Programs', 'Alyson PM', 'Tavilo Time.exe'),
        path.join('C:\\Users\\test\\AppData\\Local', 'Programs', 'Tavilo Time', 'Tavilo Time.exe'),
        path.join('C:\\Users\\test\\AppData\\Local', 'Programs', 'Alyson PM', 'Alyson PM.exe'),
      ]),
    );

    process.env.LOCALAPPDATA = prevLocal;
    process.env.USERPROFILE = prevProfile;
  });
});
