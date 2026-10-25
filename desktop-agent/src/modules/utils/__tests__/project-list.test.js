'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tavilo-projects-'));
jest.mock('electron', () => ({ app: { getPath: () => mockDir } }), { virtual: true });

const { getUserProjects } = require('../project-list');

const PROJECTS = [{ project_id: 'p1', name: 'Alpha' }, { project_id: 'p2', name: 'Beta' }];

function backend(impl) {
  return { isBackendTimeLogsEnabled: () => true, listUserProjects: jest.fn(impl) };
}
const offline = () => backend(async () => { throw new Error('fetch failed'); });

describe('project list', () => {
  beforeEach(() => {
    fs.rmSync(path.join(mockDir, 'last-projects.json'), { force: true });
    global.trayManager = { setProjectList: jest.fn() };
  });
  afterAll(() => fs.rmSync(mockDir, { recursive: true, force: true }));

  test('returns backend projects and updates the tray', async () => {
    await expect(getUserProjects('1195', {}, backend(async () => PROJECTS))).resolves.toEqual(PROJECTS);
    expect(global.trayManager.setProjectList).toHaveBeenCalledWith(PROJECTS);
  });

  test('offline at startup with nothing saved → throws so the app retries', async () => {
    await expect(getUserProjects('1195', {}, offline())).rejects.toThrow('fetch failed');
  });

  test('offline after a good load → shows the saved list', async () => {
    await getUserProjects('1195', {}, backend(async () => PROJECTS));
    await expect(getUserProjects('1195', {}, offline())).resolves.toEqual(PROJECTS);
  });

  test('saved list is never shown to a different user', async () => {
    await getUserProjects('1195', {}, backend(async () => PROJECTS));
    await expect(getUserProjects('2000', {}, offline())).rejects.toThrow();
  });

  test('a real empty list from the server is kept, not treated as an error', async () => {
    await getUserProjects('1195', {}, backend(async () => PROJECTS));
    await expect(getUserProjects('1195', {}, backend(async () => []))).resolves.toEqual([]);
    await expect(getUserProjects('1195', {}, offline())).resolves.toEqual([]);
  });
});
