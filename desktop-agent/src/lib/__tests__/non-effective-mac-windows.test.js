'use strict';

/**
 * Non-effective time on Mac and Windows.
 *
 *   non_effective = min(total, idle + low_activity)
 *   effective     = total - non_effective
 *
 * A live meeting (browser tab or desktop app) must not feed idle or low-activity.
 * Mac finds background Meet via tab URLs; Windows via window titles, CDP tab URLs,
 * or Chrome/Edge tab-strip titles. Word in front during a call stays effective.
 */

const {
  applyMeetingActivityFloor,
  noteMeetingContext,
  refreshMeetingPresence,
  isInMeetingSession,
  clearMeetingSession,
  _resetMeetingSessionForTests,
  MEETING_ACTIVITY_FLOOR_PERCENT,
} = require('../meeting-context');

const {
  isActiveGoogleMeetCallUrl,
  isVideoMeetingUrl,
  isGoogleMeetWindowTitle,
  isZoomOrTeamsCallTitle,
  isMeetingBrowserTabTitle,
  tabEvidenceLooksLikeMeeting,
  parseCdpTabTargets,
  listBrowserTabsWindows,
  listChromeFamilyTabUrlsMac,
} = require('../meeting-presence-probe');

const { computeEffectiveSeconds } = require('../../modules/utils/effective-time');

const TWO_HOURS = 2 * 3600;
const WORD = { appName: 'Microsoft Word', windowTitle: 'Notes.docx' };

function splitAfterPresence({ totalSeconds, idleSeconds, lowSeconds, probe, foreground }) {
  const inMeeting = isInMeetingSession();
  const floored = applyMeetingActivityFloor(0, foreground);
  const idleWritten = inMeeting ? 0 : idleSeconds;
  const lowWritten = inMeeting || floored >= MEETING_ACTIVITY_FLOOR_PERCENT ? 0 : lowSeconds;
  const split = computeEffectiveSeconds(totalSeconds, lowWritten, idleWritten);
  return { inMeeting, floored, probe, ...split };
}

describe('non-effective time — Mac and Windows', () => {
  beforeEach(() => {
    _resetMeetingSessionForTests();
  });

  afterEach(() => {
    _resetMeetingSessionForTests();
  });

  describe('shared formula', () => {
    test('identity: effective + non-effective === total', () => {
      const split = computeEffectiveSeconds(4 * 3600, 30 * 60, 45 * 60);
      expect(split.nonEffectiveSeconds).toBe(75 * 60);
      expect(split.effectiveSeconds).toBe(4 * 3600 - 75 * 60);
      expect(split.effectiveSeconds + split.nonEffectiveSeconds).toBe(split.totalSeconds);
    });

    test('no idle and no low activity is fully effective on both platforms', () => {
      const split = computeEffectiveSeconds(8 * 3600, 0, 0);
      expect(split.nonEffectiveSeconds).toBe(0);
      expect(split.effectiveSeconds).toBe(8 * 3600);
    });

    test('idle + low outside a meeting is non-effective', () => {
      const split = computeEffectiveSeconds(TWO_HOURS, 15 * 60, 30 * 60);
      expect(split.nonEffectiveSeconds).toBe(45 * 60);
      expect(split.effectiveSeconds).toBe(TWO_HOURS - 45 * 60);
    });
  });

  describe('Mac setup — AppleScript tab URLs', () => {
    test('Meet URL in a background Chrome tab keeps 2h of Word notes effective', async () => {
      expect(isActiveGoogleMeetCallUrl('https://meet.google.com/abc-defg-hij')).toBe(true);

      noteMeetingContext({
        appName: 'Google Chrome',
        url: 'https://meet.google.com/abc-defg-hij',
        windowTitle: 'Meet - Daily Sync - Google Chrome',
      });
      await refreshMeetingPresence({
        probe: {
          active: true,
          conclusive: true,
          label: 'Google Meet',
          evidence: 'tab:Google Chrome:https://meet.google.com/abc-defg-hij',
        },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: TWO_HOURS,
        lowSeconds: TWO_HOURS,
        probe: 'mac-applescript-tab-url',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(true);
      expect(result.floored).toBe(MEETING_ACTIVITY_FLOOR_PERCENT);
      expect(result.nonEffectiveSeconds).toBe(0);
      expect(result.effectiveSeconds).toBe(TWO_HOURS);
    });

    test('Mac listed every tab and Meet is gone — idle after the call is non-effective', async () => {
      noteMeetingContext({ url: 'https://meet.google.com/abc-defg-hij' });
      await refreshMeetingPresence({
        probe: { active: false, conclusive: true, label: null },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: 20 * 60,
        lowSeconds: 10 * 60,
        probe: 'mac-tabs-clear',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(false);
      expect(result.floored).toBe(0);
      expect(result.nonEffectiveSeconds).toBe(30 * 60);
      expect(result.effectiveSeconds).toBe(TWO_HOURS - 30 * 60);
    });

    test('listChromeFamilyTabUrlsMac is the Mac-only path', async () => {
      if (process.platform === 'darwin') {
        const tabs = await listChromeFamilyTabUrlsMac();
        expect(Array.isArray(tabs)).toBe(true);
      } else {
        await expect(listChromeFamilyTabUrlsMac()).resolves.toEqual([]);
      }
    });
  });

  describe('Windows setup — window titles + CDP + tab-strip', () => {
    test('Chrome window title Meet - … (selected tab) keeps Word notes effective', async () => {
      expect(
        isGoogleMeetWindowTitle('Meet - SMS Capacity Sync - Google Chrome', 'Google Chrome'),
      ).toBe(true);

      noteMeetingContext({
        appName: 'Google Chrome',
        windowTitle: 'Meet - SMS Capacity Sync - Google Chrome',
      });
      await refreshMeetingPresence({
        probe: {
          active: true,
          conclusive: true,
          label: 'Google Meet',
          evidence: 'window:Google Chrome:Meet - SMS Capacity Sync - Google Chrome',
        },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: TWO_HOURS,
        lowSeconds: TWO_HOURS,
        probe: 'win-window-title',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(true);
      expect(result.nonEffectiveSeconds).toBe(0);
      expect(result.effectiveSeconds).toBe(TWO_HOURS);
    });

    test('background Meet tab via Windows tab-strip titles stays effective', async () => {
      const tabs = tabEvidenceLooksLikeMeeting({
        urls: [],
        titles: ['Gmail', 'Meet - Daily Sync', 'Inbox - Outlook'],
      });
      expect(tabs).toEqual({ hit: true, label: 'Google Meet' });
      expect(isMeetingBrowserTabTitle('Meet - Daily Sync')).toBe(true);

      noteMeetingContext({
        appName: 'Google Chrome',
        windowTitle: 'Meet - Daily Sync - Google Chrome',
      });
      await refreshMeetingPresence({
        probe: {
          active: true,
          conclusive: true,
          label: 'Google Meet',
          evidence: 'win-tabs:uia:Meet - Daily Sync',
        },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: TWO_HOURS,
        lowSeconds: 0,
        probe: 'win-uia-tab-strip',
        foreground: { appName: 'Microsoft Word', windowTitle: 'POA notes.docx' },
      });

      expect(result.inMeeting).toBe(true);
      expect(result.nonEffectiveSeconds).toBe(0);
      expect(result.effectiveSeconds).toBe(TWO_HOURS);
    });

    test('Windows CDP /json tab URLs match Mac AppleScript URLs', () => {
      const parsed = parseCdpTabTargets([
        { type: 'page', url: 'https://docs.google.com/document/d/x', title: 'Notes' },
        { type: 'page', url: 'https://meet.google.com/fsj-msbw-ywi', title: 'Meet - Capacity' },
      ]);
      expect(isVideoMeetingUrl(parsed.urls[1])).toBe(true);
      expect(tabEvidenceLooksLikeMeeting(parsed)).toEqual({ hit: true, label: 'Google Meet' });
    });

    test('Windows Zoom / Teams desktop windows stay effective with no keys', async () => {
      expect(isZoomOrTeamsCallTitle('Zoom Meeting', 'Zoom')).toBe(true);
      expect(isZoomOrTeamsCallTitle('Daily standup | Microsoft Teams', 'Microsoft Teams')).toBe(true);

      noteMeetingContext({ appName: 'Zoom', windowTitle: 'Zoom Meeting' });
      await refreshMeetingPresence({
        probe: {
          active: true,
          conclusive: true,
          label: 'Zoom',
          evidence: 'window:Zoom:Zoom Meeting',
        },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: TWO_HOURS,
        lowSeconds: TWO_HOURS,
        probe: 'win-zoom-desktop',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(true);
      expect(result.nonEffectiveSeconds).toBe(0);
    });

    test('Windows inconclusive probe (no tab list) does not turn a call into non-effective', async () => {
      noteMeetingContext({
        appName: 'Google Chrome',
        windowTitle: 'Meet - SMS Capacity Sync - Google Chrome',
      });
      await refreshMeetingPresence({
        probe: { active: false, conclusive: false, label: null },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: TWO_HOURS,
        lowSeconds: TWO_HOURS,
        probe: 'win-inconclusive',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(true);
      expect(result.nonEffectiveSeconds).toBe(0);
      expect(result.effectiveSeconds).toBe(TWO_HOURS);
    });

    test('Windows listed tabs and Meet is gone — later idle is non-effective', async () => {
      noteMeetingContext({
        appName: 'Google Chrome',
        windowTitle: 'Meet - Daily Sync - Google Chrome',
      });
      await refreshMeetingPresence({
        probe: { active: false, conclusive: true, label: null },
      });

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: 25 * 60,
        lowSeconds: 5 * 60,
        probe: 'win-tabs-clear',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(false);
      expect(result.nonEffectiveSeconds).toBe(30 * 60);
    });

    test('listBrowserTabsWindows is a no-op on Mac (Windows-only scanner)', async () => {
      if (process.platform !== 'win32') {
        await expect(listBrowserTabsWindows()).resolves.toEqual({
          urls: [],
          titles: [],
          enumerated: false,
          source: null,
        });
      }
    });
  });

  describe('after Stop/Start mid-call (both platforms)', () => {
    test('brief Stop/Start does not dump the meeting into non-effective', async () => {
      const { restoreMeetingAfterBriefStop } = require('../meeting-context');
      noteMeetingContext({
        appName: 'Google Chrome',
        windowTitle: 'Meet - Capacity Sync - Google Chrome',
      });
      clearMeetingSession();
      expect(isInMeetingSession()).toBe(false);
      expect(restoreMeetingAfterBriefStop()).toBe('Google Meet');

      const result = splitAfterPresence({
        totalSeconds: TWO_HOURS,
        idleSeconds: 10 * 60,
        lowSeconds: 10 * 60,
        probe: 'brief-stop-restore',
        foreground: WORD,
      });

      expect(result.inMeeting).toBe(true);
      expect(result.nonEffectiveSeconds).toBe(0);
    });
  });
});
