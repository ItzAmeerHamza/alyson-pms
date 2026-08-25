/** Video meetings — low keyboard/mouse is expected; exclude from low-activity hours. */
export const MEETING_ACTIVITY_FLOOR_PERCENT = 50;

export function isVideoMeetingScreenshot(
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  const hay = `${appName || ''} ${windowTitle || ''}`.toLowerCase();
  if (/google meet|meet\.google\.com|(^|[/.])meet\.com([/?#:\s]|$)/.test(hay)) return true;
  if (/\bmeet\s+-/.test(hay)) return true;
  if (/\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay)) return true;
  if (/zoom meeting|zoom\.us|zoom workplace/.test(hay)) return true;
  if (/\bzoom\b/.test(hay) && /meeting|webinar|personal room|waiting room/.test(hay)) return true;
  if (/microsoft teams|teams\.microsoft\.com|\bms-?teams\b/.test(hay)) return true;
  if (/cisco webex|\bwebex\b/.test(hay)) return true;
  if (/\bskype\b/.test(hay)) return true;

  const app = (appName || '').trim().toLowerCase();
  if (app === 'zoom' || app === 'zoom.us' || app.startsWith('zoom workplace')) return true;
  if (app === 'skype' || app.startsWith('skype')) return true;
  if (app === 'google meet' || app === 'meet') return true;
  return (
    app.startsWith('microsoft teams') || app === 'teams' || app === 'msteams' || app === 'ms-teams'
  );
}

/**
 * Video meetings expect low keyboard/mouse input. When a screenshot was captured
 * during a meeting, raise its activity to at least the meeting floor so it is not
 * classified/labelled as low activity. Mirrors the desktop agent's capture-time floor.
 */
export function applyMeetingActivityFloor(
  activityPercent: number | null | undefined,
  appName?: string | null,
  windowTitle?: string | null,
): number | null | undefined {
  if (activityPercent === null || activityPercent === undefined) return activityPercent;
  const pct = Number(activityPercent);
  if (!Number.isFinite(pct)) return activityPercent;
  if (!isVideoMeetingScreenshot(appName, windowTitle)) return pct;
  return Math.max(pct, MEETING_ACTIVITY_FLOOR_PERCENT);
}

/** @deprecated use isVideoMeetingScreenshot */
export function isGoogleMeetScreenshot(
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  return isVideoMeetingScreenshot(appName, windowTitle);
}

/** SQL predicate: true when screenshot was captured during Google Meet or Zoom. */
export const SCREENSHOT_IS_VIDEO_MEETING_SQL = `(
  COALESCE(s.app_name, '') ILIKE '%google meet%'
  OR COALESCE(s.window_title, '') ILIKE '%google meet%'
  OR COALESCE(s.window_title, '') ILIKE '%meet.google.com%'
  OR COALESCE(s.window_title, '') ILIKE '%meet.com%'
  OR COALESCE(s.window_title, '') ILIKE 'Meet - %'
  OR COALESCE(s.window_title, '') ~* '[a-z]{3}-[a-z]{4}-[a-z]{3}'
  OR COALESCE(s.window_title, '') ILIKE '%zoom meeting%'
  OR COALESCE(s.window_title, '') ILIKE '%zoom.us%'
  OR COALESCE(s.window_title, '') ILIKE '%zoom workplace%'
  OR COALESCE(s.window_title, '') ILIKE '%personal meeting room%'
  OR COALESCE(s.window_title, '') ILIKE '%waiting room%'
  OR LOWER(COALESCE(s.app_name, '')) IN ('zoom', 'zoom.us')
  OR LOWER(COALESCE(s.app_name, '')) LIKE 'zoom workplace%'
  OR COALESCE(s.app_name, '') ILIKE '%microsoft teams%'
  OR COALESCE(s.window_title, '') ILIKE '%microsoft teams%'
  OR COALESCE(s.window_title, '') ILIKE '%teams.microsoft.com%'
  OR LOWER(COALESCE(s.app_name, '')) IN ('teams', 'msteams', 'ms-teams')
  OR COALESCE(s.app_name, '') ILIKE '%webex%'
  OR COALESCE(s.window_title, '') ILIKE '%webex%'
  OR COALESCE(s.app_name, '') ILIKE '%skype%'
  OR COALESCE(s.window_title, '') ILIKE '%skype%'
)`;

/** @deprecated use SCREENSHOT_IS_VIDEO_MEETING_SQL */
export const SCREENSHOT_IS_GOOGLE_MEET_SQL = SCREENSHOT_IS_VIDEO_MEETING_SQL;
