/** Video meetings — low keyboard/mouse is expected; exclude from low-activity hours. */
export const MEETING_ACTIVITY_FLOOR_PERCENT = 50;

/** Below this, a Meet/Zoom tab is leftover/AFK — do not invent meeting activity. */
export const MEETING_ASLEEP_ACTIVITY_PERCENT = 10;

/** 10 min with no input: stop the 50% floor and do not let leftover Meet shots eat idle. */
export const MEETING_IDLE_SHIELD_MS = 10 * 60 * 1000;

const ENDED_MEETING_RE =
  /you (have )?left|left the (meeting|call)|meeting ended|call ended|postattendee/i;

/** Pre-join / lobby — not in the call yet. */
const LOBBY_RE =
  /ask to join|join now|waiting room|waiting to be (admitted|let in)|ready to join|about to join|\blobby\b|pre-join|prejoin/i;

/** In-call chrome (not a Meet link on mail/calendar). */
const MEETING_UI_OCR_RE =
  /you are presenting|you're presenting|presenting, annotating|in a google meet|in (this|the) call|leave call|others? (are|is) in this call|microphone recording|you are in this call/i;

/** Call URLs. Ignored on Gmail/Calendar so an invite link is not a live call. */
const MEETING_LINK_OCR_RE =
  /meet\.google\.com\/[a-z0-9]{2,}-[a-z0-9]{2,}|meet\.com\/[a-z0-9]{2,}-[a-z0-9]{2,}|zoom\.us\/(j|s|wc)|microsoft teams meeting/i;

function looksLikeBrowserApp(appName?: string | null): boolean {
  return /chrome|brave|edge|arc|dia|chromium|firefox|safari|vivaldi/.test(
    String(appName || '').toLowerCase(),
  );
}

export function isMailOrCalendarContext(
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  const hay = `${appName || ''} ${windowTitle || ''}`.toLowerCase();
  if (!hay.trim() || /\bmeet\s+-/.test(hay)) return false;
  return /gmail|google calendar|\bcalendar\b|outlook|inbox -|mail\.google|yahoo mail/.test(hay);
}

function titleLooksLikeTeamsOrSkypeCall(hay: string): boolean {
  if (/microsoft teams|teams\.microsoft\.com|\bms-?teams\b/.test(hay)) {
    return /meetup-join|webinar|\bmeeting\b|\bcall\b/.test(hay);
  }
  if (/\bskype\b/.test(hay)) {
    return /\bcall\b|\bmeeting\b/.test(hay);
  }
  return false;
}

export function isEndedMeetingEvidence(
  appName?: string | null,
  windowTitle?: string | null,
  ocrOrVision?: string | null,
): boolean {
  return ENDED_MEETING_RE.test(`${appName || ''} ${windowTitle || ''} ${ocrOrVision || ''}`);
}

export function isLobbyOrWaitingEvidence(
  appName?: string | null,
  windowTitle?: string | null,
  ocrOrVision?: string | null,
): boolean {
  const titleHay = `${appName || ''} ${windowTitle || ''}`;
  const ocr = String(ocrOrVision || '');
  if (LOBBY_RE.test(titleHay)) return true;
  if (ENDED_MEETING_RE.test(`${titleHay} ${ocr}`)) return false;
  if (LOBBY_RE.test(ocr) && !MEETING_UI_OCR_RE.test(ocr)) return true;
  return false;
}

/** Tesseract excerpt + DeepSeek description used as OCR/vision haystack. */
export function combineMeetingOcrHay(
  ...parts: Array<string | null | undefined>
): string {
  return parts.filter((p) => String(p || '').trim()).join('\n');
}

export function hasLiveCallOcrOrVision(
  ocrOrVision?: string | null,
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  const text = String(ocrOrVision || '');
  if (!text.trim() || ENDED_MEETING_RE.test(text)) return false;
  if (isLobbyOrWaitingEvidence(appName, windowTitle, text)) return false;
  if (isMailOrCalendarContext(appName, windowTitle)) {
    return MEETING_UI_OCR_RE.test(text);
  }
  return MEETING_UI_OCR_RE.test(text) || MEETING_LINK_OCR_RE.test(text);
}

/**
 * Strong live-call window/app titles. OCR is not required.
 * Does not use the loose 3-4-3 Meet code (filenames / git slugs false-positive).
 */
export function isVideoMeetingScreenshot(
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  const hay = `${appName || ''} ${windowTitle || ''}`.toLowerCase();
  if (!hay.trim() || ENDED_MEETING_RE.test(hay) || LOBBY_RE.test(hay)) return false;
  if (isMailOrCalendarContext(appName, windowTitle)) return false;
  if (/google meet|meet\.google\.com/.test(hay)) return true;
  if (/(^|[/.])meet\.com\/[a-z0-9]/.test(hay)) return true;
  if (/\bmeet\s+-/.test(hay)) return true;
  if (/zoom meeting|zoom\.us|zoom workplace/.test(hay)) return true;
  if (/\bzoom\b/.test(hay) && /meeting|webinar|personal room/.test(hay)) return true;
  if (titleLooksLikeTeamsOrSkypeCall(hay)) return true;
  if (/cisco webex/.test(hay)) return true;
  if (/\bwebex\b/.test(hay) && /meeting|webinar/.test(hay)) return true;
  if (/microphone recording/.test(hay) && /cintara|brave|chrome|edge/.test(hay)) return true;

  const app = (appName || '').trim().toLowerCase();
  if (app === 'zoom' || app === 'zoom.us' || app.startsWith('zoom workplace')) return true;
  if (app === 'google meet' || app === 'meet') return true;
  if (/\bwebex\b/.test(app)) return true;
  return false;
}

/**
 * Title, Tesseract OCR, and vision summary together.
 * Dual-screen: Word/Cursor in front still counts when OCR/vision shows a live call.
 * Ambiguous titles (3-4-3 codes, calendar "Google Meet") need live-call OCR/vision.
 */
export function hasVideoMeetingEvidence(
  appName?: string | null,
  windowTitle?: string | null,
  ocrOrVision?: string | null,
): boolean {
  if (isEndedMeetingEvidence(appName, windowTitle, ocrOrVision)) return false;
  if (isLobbyOrWaitingEvidence(appName, windowTitle, ocrOrVision)) return false;
  if (isVideoMeetingScreenshot(appName, windowTitle)) return true;
  if (hasLiveCallOcrOrVision(ocrOrVision, appName, windowTitle)) return true;
  const hay = `${appName || ''} ${windowTitle || ''}`.toLowerCase();
  if (
    looksLikeBrowserApp(appName) &&
    /\b[a-z]{3}-[a-z]{4}-[a-z]{3}\b/.test(hay) &&
    hasLiveCallOcrOrVision(ocrOrVision, appName, windowTitle)
  ) {
    return true;
  }
  return false;
}

/**
 * True when capture-time activity shows the user was still in the call
 * (desktop floors live meetings to ≥ 50%). 0–9% is leftover tab / sleep.
 * Null activity (older rows) stays eligible so dual-screen history is kept.
 */
export function isParticipatingMeetingActivity(
  activityPercent?: number | null,
): boolean {
  if (activityPercent === null || activityPercent === undefined) return true;
  const pct = Number(activityPercent);
  if (!Number.isFinite(pct)) return true;
  return pct >= MEETING_ACTIVITY_FLOOR_PERCENT;
}

/**
 * Video meetings expect low keyboard/mouse input. Live calls are floored at
 * capture while input is still recent. A leftover Meet tab while the user is
 * asleep is stored at 0–9% and must not be raised — that was extra-counting.
 */
export function applyMeetingActivityFloor(
  activityPercent: number | null | undefined,
  appName?: string | null,
  windowTitle?: string | null,
  ocrOrVision?: string | null,
): number | null | undefined {
  if (activityPercent === null || activityPercent === undefined) return activityPercent;
  const pct = Number(activityPercent);
  if (!Number.isFinite(pct)) return activityPercent;
  if (!hasVideoMeetingEvidence(appName, windowTitle, ocrOrVision)) return pct;
  if (pct < MEETING_ASLEEP_ACTIVITY_PERCENT) return pct;
  return Math.max(pct, MEETING_ACTIVITY_FLOOR_PERCENT);
}

/** @deprecated use isVideoMeetingScreenshot */
export function isGoogleMeetScreenshot(
  appName?: string | null,
  windowTitle?: string | null,
): boolean {
  return isVideoMeetingScreenshot(appName, windowTitle);
}

function floorMeetingPercent(
  activityPercent: number | null | undefined,
  meeting: boolean,
): number | null | undefined {
  if (activityPercent === null || activityPercent === undefined) return activityPercent;
  const pct = Number(activityPercent);
  if (!Number.isFinite(pct)) return activityPercent;
  if (!meeting) return pct;
  return Math.max(pct, MEETING_ACTIVITY_FLOOR_PERCENT);
}

export function applyMeetingScreenshotPresentation<
  T extends {
    app_name?: string | null;
    window_title?: string | null;
    vision_summary?: string | null;
    ocr_text?: string | null;
    ocr_excerpt?: string | null;
    activity_percent?: number | null;
    focus_percent?: number | null;
    category?: string | null;
    is_work_related?: boolean | null;
    distraction_score?: number | null;
    confidence_score?: number | null;
    activity_type?: string | null;
    productivity_flag?: string | null;
  },
>(row: T): T {
  const ocrHay = combineMeetingOcrHay(row.ocr_excerpt, row.ocr_text, row.vision_summary);
  const meeting = hasVideoMeetingEvidence(row.app_name, row.window_title, ocrHay);
  const participating = isParticipatingMeetingActivity(row.activity_percent);
  const activity_percent = floorMeetingPercent(row.activity_percent, meeting && participating);
  const focus_percent = floorMeetingPercent(row.focus_percent, meeting && participating);
  if (!meeting || !participating) {
    return { ...row, activity_percent, focus_percent };
  }
  return {
    ...row,
    activity_percent,
    focus_percent,
    category: 'productive',
    activity_type: 'communication',
    is_work_related: true,
    distraction_score: 0,
    confidence_score: Math.max(Number(row.confidence_score) || 0, 70),
    ...(row.productivity_flag !== undefined ? { productivity_flag: 'on_task' } : {}),
  };
}

const MEETING_OCR_HAY_SQL = `(COALESCE(s.vision_summary, '') || ' ' || COALESCE(s.vision_analysis #>> '{image_context,ocr_excerpt}', ''))`;

const SCREENSHOT_IS_ENDED_MEETING_SQL = `(
  COALESCE(s.window_title, '') ILIKE '%you left%'
  OR COALESCE(s.window_title, '') ILIKE '%left the meeting%'
  OR COALESCE(s.window_title, '') ILIKE '%meeting ended%'
  OR COALESCE(s.window_title, '') ILIKE '%waiting room%'
  OR COALESCE(s.window_title, '') ILIKE '%ask to join%'
  OR COALESCE(s.window_title, '') ILIKE '%join now%'
  OR COALESCE(s.vision_summary, '') ILIKE '%you left the meeting%'
  OR COALESCE(s.vision_summary, '') ILIKE '%you have left%'
  OR COALESCE(s.vision_summary, '') ILIKE '%left the call%'
  OR COALESCE(s.vision_summary, '') ILIKE '%ask to join%'
  OR COALESCE(s.vision_summary, '') ILIKE '%waiting room%'
  OR COALESCE(s.vision_analysis #>> '{image_context,ocr_excerpt}', '') ILIKE '%you left%'
  OR COALESCE(s.vision_analysis #>> '{image_context,ocr_excerpt}', '') ILIKE '%ask to join%'
  OR COALESCE(s.vision_analysis #>> '{image_context,ocr_excerpt}', '') ILIKE '%waiting room%'
)`;

const SCREENSHOT_IS_MAIL_OR_CALENDAR_SQL = `(
  COALESCE(s.window_title, '') NOT ILIKE 'Meet - %'
  AND (
    COALESCE(s.window_title, '') ILIKE '%gmail%'
    OR COALESCE(s.window_title, '') ILIKE '%google calendar%'
    OR COALESCE(s.window_title, '') ILIKE '%outlook%'
    OR COALESCE(s.window_title, '') ILIKE '%inbox -%'
    OR COALESCE(s.window_title, '') ILIKE '% - calendar -%'
  )
)`;

const SCREENSHOT_HAS_MEETING_UI_OCR_SQL = `(
  ${MEETING_OCR_HAY_SQL} ILIKE '%you are presenting%'
  OR ${MEETING_OCR_HAY_SQL} ILIKE '%presenting, annotating%'
  OR ${MEETING_OCR_HAY_SQL} ILIKE '%in a google meet%'
  OR ${MEETING_OCR_HAY_SQL} ILIKE '%in this call%'
  OR ${MEETING_OCR_HAY_SQL} ILIKE '%leave call%'
  OR ${MEETING_OCR_HAY_SQL} ILIKE '%microphone recording%'
)`;

const SCREENSHOT_HAS_LIVE_CALL_OCR_SQL = `(
  CASE
    WHEN ${SCREENSHOT_IS_MAIL_OR_CALENDAR_SQL} THEN ${SCREENSHOT_HAS_MEETING_UI_OCR_SQL}
    ELSE (
      ${SCREENSHOT_HAS_MEETING_UI_OCR_SQL}
      OR ${MEETING_OCR_HAY_SQL} ~* 'meet\\.google\\.com/[a-z0-9]{2,}-[a-z0-9]{2,}'
      OR ${MEETING_OCR_HAY_SQL} ~* 'zoom\\.us/(j|s|wc)'
      OR ${MEETING_OCR_HAY_SQL} ILIKE '%microsoft teams meeting%'
    )
  END
)`;

/** SQL predicate: live video call from title and/or OCR/vision — not calendar/mail chatter. */
export const SCREENSHOT_IS_VIDEO_MEETING_SQL = `(
  NOT ${SCREENSHOT_IS_ENDED_MEETING_SQL}
  AND (
    (
      NOT ${SCREENSHOT_IS_MAIL_OR_CALENDAR_SQL}
      AND (
        COALESCE(s.app_name, '') ILIKE '%google meet%'
        OR COALESCE(s.window_title, '') ILIKE '%google meet%'
        OR COALESCE(s.window_title, '') ILIKE '%meet.google.com%'
        OR COALESCE(s.window_title, '') ILIKE '%meet.com/%'
        OR COALESCE(s.window_title, '') ILIKE 'Meet - %'
        OR COALESCE(s.window_title, '') ILIKE '%zoom meeting%'
        OR COALESCE(s.window_title, '') ILIKE '%zoom.us%'
        OR COALESCE(s.window_title, '') ILIKE '%zoom workplace%'
        OR COALESCE(s.window_title, '') ILIKE '%personal meeting room%'
        OR LOWER(COALESCE(s.app_name, '')) IN ('zoom', 'zoom.us')
        OR LOWER(COALESCE(s.app_name, '')) LIKE 'zoom workplace%'
        OR (
          (
            COALESCE(s.app_name, '') ILIKE '%microsoft teams%'
            OR COALESCE(s.window_title, '') ILIKE '%microsoft teams%'
            OR COALESCE(s.window_title, '') ILIKE '%teams.microsoft.com%'
            OR LOWER(COALESCE(s.app_name, '')) IN ('teams', 'msteams', 'ms-teams')
          )
          AND (
            COALESCE(s.window_title, '') ILIKE '%meeting%'
            OR COALESCE(s.window_title, '') ILIKE '%call%'
            OR COALESCE(s.window_title, '') ILIKE '%meetup-join%'
            OR COALESCE(s.window_title, '') ILIKE '%webinar%'
          )
        )
        OR (
          (
            COALESCE(s.app_name, '') ILIKE '%skype%'
            OR COALESCE(s.window_title, '') ILIKE '%skype%'
          )
          AND (
            COALESCE(s.window_title, '') ILIKE '%call%'
            OR COALESCE(s.window_title, '') ILIKE '%meeting%'
          )
        )
        OR COALESCE(s.app_name, '') ILIKE '%webex%'
        OR (
          COALESCE(s.window_title, '') ILIKE '%webex%'
          AND COALESCE(s.window_title, '') ILIKE '%meeting%'
        )
        OR (
          COALESCE(s.window_title, '') ILIKE '%microphone recording%'
          AND (
            COALESCE(s.window_title, '') ILIKE '%cintara%'
            OR COALESCE(s.window_title, '') ILIKE '%brave%'
            OR COALESCE(s.window_title, '') ILIKE '%chrome%'
            OR COALESCE(s.window_title, '') ILIKE '%edge%'
          )
        )
      )
    )
    OR ${SCREENSHOT_HAS_LIVE_CALL_OCR_SQL}
  )
)`;

/** Live call that still has capture-time activity (not leftover tab / sleep). */
export const SCREENSHOT_IS_PARTICIPATING_MEETING_SQL = `(
  ${SCREENSHOT_IS_VIDEO_MEETING_SQL}
  AND COALESCE(s.activity_percent, ${MEETING_ACTIVITY_FLOOR_PERCENT}) >= ${MEETING_ACTIVITY_FLOOR_PERCENT}
)`;

/** @deprecated use SCREENSHOT_IS_VIDEO_MEETING_SQL */
export const SCREENSHOT_IS_GOOGLE_MEET_SQL = SCREENSHOT_IS_VIDEO_MEETING_SQL;
