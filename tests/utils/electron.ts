import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

export interface TestHooks {
  getState(): Promise<any>;
  forceIdle(ms: number): Promise<void>;
  snapNow(): Promise<void>;
  focusApp(name: string, title: string): Promise<void>;
  focusUrl(url: string): Promise<void>;
  offline(): Promise<void>;
  online(): Promise<void>;
  clearQueues(): Promise<void>;
  setProject(projectId: string): Promise<void>;
  getSession(): Promise<any>;
  startTracking(projectId?: string): Promise<any>;
  stopTracking(): Promise<any>;
  pauseTracking(): Promise<any>;
  resumeTracking(): Promise<any>;
  
  // Additional comprehensive testing hooks
  emitActivity(params: { kpm: number; cpm: number; move: number; intervalMs?: number }): Promise<any>;
  snapWithHash(hash: string): Promise<any>;
  markSensitive(sensitive?: boolean): Promise<any>;
  emitAntiCheat(params: { type: string; confidence: number }): Promise<any>;
  setPermissions(params: { screenRecording: boolean; inputMonitoring: boolean }): Promise<any>;
  setNetworkState(params: { online: boolean; failureType?: string }): Promise<any>;
  emitReportingSignal(signalType: string): Promise<any>;
}

export class ElectronTestApp {
  private app: ElectronApplication | null = null;
  private page: Page | null = null;
  public testRunId: string;

  constructor(testRunId: string) {
    this.testRunId = testRunId;
  }

  async launch(): Promise<{ app: ElectronApplication; page: Page; hooks: TestHooks }> {
    const desktopAgentPath = path.join(__dirname, '../../desktop-agent');
    const electronPath = path.join(__dirname, '../../desktop-agent/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
    
    // Launch Electron app with TEST_MODE
    this.app = await electron.launch({
      executablePath: electronPath,
      args: [desktopAgentPath],
      env: {
        ...process.env,
        TEST_MODE: '1',
        TEST_RUN_ID: this.testRunId,
        NODE_ENV: 'test',
        // Use test Supabase project/credentials
        VITE_SUPABASE_URL: process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
      },
    });

    // Wait for the main window
    this.page = await this.app.firstWindow();
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for app initialization
    await this.page.waitForTimeout(2000);

    // Create test hooks interface
    const hooks: TestHooks = {
      getState: () => this.invokeMain('test:getState'),
      forceIdle: (ms: number) => this.invokeMain('test:forceIdle', ms),
      snapNow: () => this.invokeMain('test:snapNow'),
      focusApp: (name: string, title: string) => this.invokeMain('test:focusApp', { name, title }),
      focusUrl: (url: string) => this.invokeMain('test:focusUrl', url),
      offline: () => this.invokeMain('test:offline'),
      online: () => this.invokeMain('test:online'),
      clearQueues: () => this.invokeMain('test:clearQueues'),
      setProject: (projectId: string) => this.invokeMain('test:setProject', projectId),
      getSession: () => this.invokeMain('get-tracking-status'),
      startTracking: (projectId?: string) => this.invokeMain('start-timer', projectId),
      stopTracking: () => this.invokeMain('stop-timer', 'test'),
      pauseTracking: () => this.invokeMain('pause-timer'),
      resumeTracking: () => this.invokeMain('resume-timer'),
      
      // Additional comprehensive testing hooks
      emitActivity: (params: { kpm: number; cpm: number; move: number; intervalMs?: number }) => this.invokeMain('test:emitActivity', params),
      snapWithHash: (hash: string) => this.invokeMain('test:snapWithHash', hash),
      markSensitive: (sensitive?: boolean) => this.invokeMain('test:markSensitive', sensitive),
      emitAntiCheat: (params: { type: string; confidence: number }) => this.invokeMain('test:emitAntiCheat', params),
      setPermissions: (params: { screenRecording: boolean; inputMonitoring: boolean }) => this.invokeMain('test:setPermissions', params),
      setNetworkState: (params: { online: boolean; failureType?: string }) => this.invokeMain('test:setNetworkState', params),
      emitReportingSignal: (signalType: string) => this.invokeMain('test:emitReportingSignal', signalType),
    };

    return { app: this.app, page: this.page, hooks };
  }

  private async invokeMain(channel: string, ...args: any[]): Promise<any> {
    if (!this.page) throw new Error('Page not initialized');
    
    return this.page.evaluate(
      ({ channel, args }) => {
        // Desktop agent has nodeIntegration: true, so we can access ipcRenderer directly
        const { ipcRenderer } = require('electron');
        return ipcRenderer.invoke(channel, ...args);
      },
      { channel, args }
    );
  }

  async close(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
      this.page = null;
    }
  }

  async screenshot(name: string): Promise<Buffer> {
    if (!this.page) throw new Error('Page not initialized');
    return this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }

  async waitForSelector(selector: string, timeout = 10000): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.waitForSelector(selector, { timeout });
  }

  async click(selector: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.fill(selector, value);
  }

  async selectOption(selector: string, value: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.selectOption(selector, value);
  }

  async getText(selector: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    const element = await this.page.$(selector);
    return element ? await element.textContent() || '' : '';
  }

  async getInputValue(selector: string): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');
    return this.page.inputValue(selector);
  }

  async isVisible(selector: string): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    return this.page.isVisible(selector);
  }

  async waitForNavigation(url?: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    if (url) {
      await this.page.waitForURL(url);
    } else {
      await this.page.waitForLoadState('domcontentloaded');
    }
  }

  async reload(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    await this.page.reload();
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export async function launchElectronApp(testRunId: string): Promise<ElectronTestApp> {
  const app = new ElectronTestApp(testRunId);
  await app.launch();
  return app;
}
