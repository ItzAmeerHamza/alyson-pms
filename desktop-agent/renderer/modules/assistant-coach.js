const { workDateKey } = require('../../src/modules/utils/work-timezone');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hoursLabel(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value) || Math.abs(value) < 1 / 120) return '0 min';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let whole = Math.floor(abs);
  let minutes = Math.round((abs - whole) * 60);
  if (minutes >= 60) {
    whole += 1;
    minutes = 0;
  }
  const hourPart = whole === 0 ? null : `${whole} ${whole === 1 ? 'hour' : 'hours'}`;
  const minPart = minutes === 0 ? null : `${minutes} min`;
  if (!hourPart) return `${sign}${minPart}`;
  if (!minPart) return `${sign}${hourPart}`;
  return `${sign}${hourPart} ${minPart}`;
}

function hoursToSeconds(hours) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 3600));
}

function formatClock(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatCompact(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Same seconds the tray clock and Time Tracker use for today. */
function readLiveTodaySplit() {
  if (typeof window === 'undefined' || !window.__effectiveStatsReady) return null;
  const total = Math.max(0, Math.floor(Number(window.__todayTrackedSeconds) || 0));
  if (total <= 0) return null;
  const raw =
    typeof window.resolveDisplayedNonEffectiveSeconds === 'function'
      ? window.resolveDisplayedNonEffectiveSeconds()
      : window.__todayNonEffectiveSeconds;
  const nonEffective = Math.min(total, Math.max(0, Math.floor(Number(raw) || 0)));
  return { total, effective: total - nonEffective, nonEffective };
}

/**
 * Week and month already include today's Pulse hours. Swap that slice for the
 * live tray total so Coach cannot show a different today than the menu bar.
 */
function periodSplit(coaching, prefix, delta) {
  const source = coaching || {};
  const total = Math.max(0, hoursToSeconds(source[`${prefix}_hours_worked`]) + (delta?.total || 0));
  const nonField = source[`${prefix}_non_effective_hours`];
  const nonBase =
    nonField == null
      ? Math.max(0, hoursToSeconds(source[`${prefix}_hours_worked`]) - hoursToSeconds(source[`${prefix}_effective_hours`]))
      : hoursToSeconds(nonField);
  const nonEffective = Math.min(total, Math.max(0, nonBase + (delta?.nonEffective || 0)));
  return { total, effective: Math.max(0, total - nonEffective), nonEffective };
}

const OFF_TOPIC_COACH_REPLY =
  'I am your work coach, so I stick to your work: your time and targets, focus, breaks, distractions, planning your day, and quick work updates. Ask me anything about those.';

/** Plain arithmetic is the only thing refused locally; Tavilo Coach decides the rest. */
function coachQuestionIsInContext(message) {
  const q = String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q) return true;
  return !/^(what is |whats )?-?\d+(?:\.\d+)?\s*[+\-*/x]\s*-?\d+(?:\.\d+)?$/.test(q);
}

/** Asking for advice, a plan, a comparison or a "why" needs Tavilo Coach, not a number readout. */
const COACH_REASONING_RE =
  /\b(why|how (can|do|should|could|would) i|should|tips?|advice|advise|improve|better|worse|plan|focus(ed)?|compare[ds]?|vs|versus|need|left|remaining|until|reach|hit|target|goal|help|write|draft|best|worst|most|least|distract\w*|suggest\w*|reduce|lower|cut|explain|mean|tomorrow|tired|burn\w*|breaks?(?!\s+down)|morning|afternoon|yesterday|trend|standup|stand-up|update)\b/;

function spokenDuration(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const whole = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const hourPart = whole === 0 ? null : `${whole} ${whole === 1 ? 'hour' : 'hours'}`;
  const minPart = minutes === 0 ? null : `${minutes} min`;
  if (!hourPart && !minPart) return '0 min';
  if (!hourPart) return minPart;
  if (!minPart) return hourPart;
  return `${hourPart} ${minPart}`;
}

/** Same today / week / month split the tracker cards use. */
function recordedSnapshot(stats, live) {
  const source = stats || {};
  const today = live || {
    total: hoursToSeconds(source.tracked_hours ?? source.hours_worked),
    nonEffective: hoursToSeconds(source.non_effective_hours),
  };
  const total = Math.max(0, Math.floor(Number(today.total) || 0));
  const nonEffective = Math.min(total, Math.max(0, Math.floor(Number(today.nonEffective) || 0)));
  const effective = Math.max(0, total - nonEffective);
  const delta = live ? liveDelta(source, { total, nonEffective }) : null;
  const coaching = source.coaching || {};
  return {
    total,
    effective,
    nonEffective,
    week: periodSplit(coaching, 'week', delta),
    month: periodSplit(coaching, 'month', delta),
    coaching,
    dailyHours: Number(source.hours_threshold) || 0,
  };
}

/**
 * Instant, live-tray answer for plain "what is my X" lookups. Returns null for
 * everything else so Tavilo Coach (the backend model) answers it.
 */
function instantCoachReply(stats, message, live) {
  if (!coachQuestionIsInContext(message)) return OFF_TOPIC_COACH_REPLY;
  if (!stats && !live) return null;
  const q = String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!q || COACH_REASONING_RE.test(q)) return null;
  const snap = recordedSnapshot(stats, live);
  const total = spokenDuration(snap.total);
  const effective = spokenDuration(snap.effective);
  const nonEff = spokenDuration(snap.nonEffective);
  const today = `Total time is ${total}. Effective time is ${effective}. Non-effective time is ${nonEff}.`;
  if (/\b(screenshot|screen shot)\b/.test(q) && stats) {
    const shot = stats.screenshots || {};
    const totalShots = Number(shot.total) || 0;
    if (!totalShots) return 'No screenshots of your screen have synced for this day yet.';
    const analyzed = Number(shot.analyzed) || 0;
    if (!analyzed) return `You have ${totalShots} screenshot${totalShots === 1 ? '' : 's'} today; analysis is still running.`;
    return `I looked at ${analyzed} of your ${totalShots} screenshots: ${Number(shot.productive) || 0} on-task, ${Number(shot.neutral) || 0} mixed, ${Number(shot.distraction) || 0} off-task, ${Number(shot.meeting) || 0} video-meeting.`;
  }
  if (/\bthis week\b/.test(q) || (/\bweek\b/.test(q) && !/\btoday\b/.test(q))) {
    return `This week: ${spokenDuration(snap.week.total)} total time, ${spokenDuration(snap.week.effective)} effective time, ${spokenDuration(snap.week.nonEffective)} non-effective time.`;
  }
  if (/\bmonth\b/.test(q)) {
    return `This month: ${spokenDuration(snap.month.total)} total time, ${spokenDuration(snap.month.effective)} effective time, ${spokenDuration(snap.month.nonEffective)} non-effective time. Today: ${today}`;
  }
  if (/\b(break down|breakdown|summarize|summary|total time|effective|non-?effective|how much time|how long)\b/.test(q)) {
    return today;
  }
  return null;
}

function paceCopy({ effectiveSeconds, expectedHours, targetHours, finishedWeekdays, dailyHours, periodLabel }) {
  const effective = Math.max(0, Number(effectiveSeconds) || 0);
  const expected = Math.max(0, Number(expectedHours) || 0);
  const target = Math.max(0, Number(targetHours) || 0);
  const finished = Math.max(0, Math.floor(Number(finishedWeekdays) || 0));
  const daily = Math.max(0, Number(dailyHours) || 0);
  const effectiveHours = effective / 3600;
  const gapHours = effectiveHours - expected;
  let tone = 'even';
  let status = 'On pace for this point';
  if (expected <= 0 && effective <= 0) {
    status = 'No effective time yet';
  } else if (expected <= 0) {
    status = 'Pace starts after the first finished weekday';
  } else if (gapHours > 0.25) {
    tone = 'ahead';
    status = `Ahead by ${formatCompact(gapHours * 3600)}`;
  } else if (gapHours < -0.25) {
    tone = 'behind';
    status = `Behind by ${formatCompact(Math.abs(gapHours) * 3600)}`;
  }
  const towardTarget = target > 0 ? Math.max(0, Math.min(100, (effectiveHours / target) * 100)) : 0;
  const dayWord = finished === 1 ? 'finished weekday' : 'finished weekdays';
  const dailyLabel = daily > 0 ? hoursLabel(daily) : 'the daily goal';
  const detail = expected > 0
    ? `Expected by now: ${formatCompact(expected * 3600)}. That is ${dailyLabel} for each of ${finished} ${dayWord}. Today is not counted in that expectation until the day is over. The bar is ${formatCompact(effective)} of the ${formatCompact(target * 3600)} ${periodLabel} target.`
    : `The bar is progress toward the ${formatCompact(target * 3600)} ${periodLabel} target.`;
  return { status, detail, tone, percent: towardTarget };
}

/**
 * Opening chat line. Uses the same seconds as the tracker clock.
 */
function liveOpening(stats, { live } = {}) {
  const snap = recordedSnapshot(stats, live);
  const { total, effective, nonEffective, week, month, coaching } = snap;
  const dailyHours = snap.dailyHours;
  const weekPace = paceCopy({
    effectiveSeconds: week.effective,
    expectedHours: coaching.week_expected_hours,
    targetHours: coaching.weekly_target_hours,
    finishedWeekdays: coaching.completed_weekdays,
    dailyHours,
    periodLabel: 'week',
  });
  const monthPace = paceCopy({
    effectiveSeconds: month.effective,
    expectedHours: coaching.month_expected_hours,
    targetHours: coaching.month_target_hours,
    finishedWeekdays: coaching.month_completed_weekdays,
    dailyHours,
    periodLabel: 'month',
  });
  const todayLine = total > 0
    ? `Today: ${spokenDuration(total)} total time, ${spokenDuration(effective)} effective time, ${spokenDuration(nonEffective)} non-effective time.`
    : 'Nothing is recorded for today yet.';
  return [
    'Here is your recorded time.',
    `This month: ${spokenDuration(month.total)} total time, ${spokenDuration(month.effective)} effective time, ${spokenDuration(month.nonEffective)} non-effective time. ${monthPace.status}.`,
    `This week: ${spokenDuration(week.total)} total time, ${spokenDuration(week.effective)} effective time, ${spokenDuration(week.nonEffective)} non-effective time. ${weekPace.status}.`,
    todayLine,
  ].join('\n\n');
}

function liveDelta(stats, live) {
  if (!live) return null;
  return {
    total: live.total - hoursToSeconds(stats?.tracked_hours ?? stats?.hours_worked),
    nonEffective: live.nonEffective - hoursToSeconds(stats?.non_effective_hours),
  };
}

function shiftDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function renderSafeText(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(dateKey, todayKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return 'Today';
  const dt = new Date(Date.UTC(y, m - 1, d));
  const label = `${WEEKDAY_SHORT[dt.getUTCDay()]}, ${MONTH_SHORT[m - 1]} ${d}`;
  return dateKey === todayKey ? `${label} · Today` : label;
}

const AUTH_TTL_MS = 4 * 60 * 1000;
let cachedCoachAuth = { at: 0, value: null };

function resetCoachAuthCacheForTests() {
  cachedCoachAuth = { at: 0, value: null };
}

async function resolveCoachIdToken(ipcRenderer, cognitoAuth = require('./cognito-auth')) {
  if (cachedCoachAuth.value?.idToken && Date.now() - cachedCoachAuth.at < AUTH_TTL_MS) {
    return cachedCoachAuth.value;
  }
  const authConfig = await ipcRenderer.invoke('get-config');
  const disk = await ipcRenderer.invoke('load-user-session');
  if (disk) cognitoAuth.hydrateCognitoSessionFromDisk(disk);
  const session = await cognitoAuth.getCurrentCognitoSession(authConfig);
  if (!session?.idToken) return null;
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('alyson_user') || '{}') || {};
  } catch {
    user = {};
  }
  try {
    if (user?.id && session.refreshToken) {
      await ipcRenderer.invoke('user-logged-in', {
        user,
        session: {
          access_token: session.idToken,
          refresh_token: session.refreshToken,
          expires_at: session.expiresAt,
          refresh_expires_at: session.refreshExpiresAt,
          email: session.email || user.email,
          remember_me: true,
          auth_provider: 'cognito',
          organization_id: user.organization_id || disk?.organization_id,
          organization_slug: user.organization_slug || disk?.organization_slug,
        },
      });
    }
  } catch {
    /* main process still refreshes from disk if this persist fails */
  }
  const value = {
    idToken: session.idToken,
    organizationId: user.organization_id || disk?.organization_id || null,
  };
  cachedCoachAuth = { at: Date.now(), value };
  return value;
}

class AssistantCoach {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.dateKey = workDateKey();
    this.history = [];
    this.loading = false;
    this.bound = false;
    this._lastPayload = null;
  }

  hasPaintedBriefing() {
    if (!this._lastPayload || this._lastPayload.date !== this.dateKey) return false;
    if (!this.history.length) return false;
    try {
      return Boolean(document.querySelector('#assistantChatLog .assistant-msg:not(.is-typing)'));
    } catch {
      return this.history.length > 0;
    }
  }

  restoreChatFromHistory() {
    const log = document.getElementById('assistantChatLog');
    if (!log || log.querySelector('.assistant-msg:not(.is-typing)')) return;
    for (const turn of this.history) {
      if (turn?.content) this.appendChat(turn.role || 'assistant', turn.content);
    }
  }

  open() {
    this.bindOnce();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    if (this.hasPaintedBriefing()) {
      this.setBusy(false);
      void this.refresh({ silent: true });
      return;
    }
    if (this._lastPayload && this._lastPayload.date === this.dateKey) {
      this.renderPayload(this._lastPayload, { resetChat: this.history.length === 0 });
      this.restoreChatFromHistory();
      this.setBusy(false);
      void this.refresh({ silent: true });
      return;
    }
    if (this.loading) {
      this._openWhenReady = true;
      this.setBusy(true, { typing: true });
      return;
    }
    this.refresh();
  }

  prefetch() {
    if (this._lastPayload && this._lastPayload.date === this.dateKey) return;
    if (this.loading) return;
    void this.refresh({ silent: true, prefetch: true });
  }

  bindOnce() {
    if (this.bound) return;
    this.bound = true;
    const prev = document.getElementById('assistantPrevDay');
    const next = document.getElementById('assistantNextDay');
    const refresh = document.getElementById('assistantRefresh');
    const form = document.getElementById('assistantChatForm');
    const input = document.getElementById('assistantChatInput');
    prev?.addEventListener('click', () => this.shiftDay(-1));
    next?.addEventListener('click', () => this.shiftDay(1));
    refresh?.addEventListener('click', () => this.refresh({ force: true }));
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.sendChat();
    });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.sendChat();
      }
    });
    document.querySelectorAll('[data-assistant-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-assistant-prompt');
        if (prompt) this.sendChat(prompt);
      });
    });
  }

  todayKey() {
    return workDateKey();
  }

  isCoachPageOpen() {
    try {
      return Boolean(document.getElementById('assistantPage')?.classList.contains('active'));
    } catch {
      return false;
    }
  }

  shiftDay(delta) {
    const next = shiftDateKey(this.dateKey, delta);
    if (next > this.todayKey()) return;
    this.dateKey = next;
    this._loadGen = (this._loadGen || 0) + 1;
    this.history = [];
    this.clearChat();
    this.refresh({ force: true });
  }

  async refresh(opts = {}) {
    if (this.loading && !opts.force) return;
    const dateKey = this.dateKey;
    const silent = Boolean(opts.silent);
    const keepChat = silent || Boolean(this.history.length);
    const loadId = (this._loadGen = (this._loadGen || 0) + 1);
    this.loading = true;
    if (!silent) {
      this.setStatus('Reading your month so far…', 'busy');
      this.setBusy(true, { typing: true });
    }
    try {
      const auth = await resolveCoachIdToken(this.ipcRenderer);
      const result = await this.ipcRenderer.invoke('assistant:briefing', {
        date: dateKey,
        idToken: auth?.idToken,
        organizationId: auth?.organizationId,
        force: Boolean(opts.force),
      });
      if (loadId !== this._loadGen || this.dateKey !== dateKey) return;
      if (!result?.success) {
        if (!silent) {
          this.setStatus(result?.error || 'Could not load Tavilo Coach right now.', 'error');
        }
        return;
      }
      this._lastPayload = result.data;
      const pageOpen = Boolean(this._openWhenReady) || this.isCoachPageOpen();
      const paintOpening = !keepChat || (this.history.length === 0 && pageOpen);
      if (opts.prefetch && this.hasPaintedBriefing()) return;
      const resetChat = paintOpening && this.history.length === 0;
      this.renderPayload(result.data, { resetChat });
      if (opts.force && !resetChat) {
        this.replaceFirstAssistantMessage(liveOpening(result.data?.stats, {
          live: dateKey === this.todayKey() ? readLiveTodaySplit() : null,
        }));
      } else if (!paintOpening) {
        this.restoreChatFromHistory();
      }
      this._openWhenReady = false;
    } catch (err) {
      if (loadId !== this._loadGen || this.dateKey !== dateKey) return;
      if (!silent) this.setStatus('Could not load Tavilo Coach right now.', 'error');
    } finally {
      if (loadId === this._loadGen) {
        this.loading = false;
        if (!silent) this.setBusy(false);
      }
    }
  }

  async sendChat(preset) {
    const input = document.getElementById('assistantChatInput');
    const message = String(preset || input?.value || '').trim();
    if (!message || this.loading) return;
    if (input) input.value = '';
    this.appendChat('user', message);
    const recordedReply = this.recordedReply(message);
    if (recordedReply) {
      this.history.push({ role: 'user', content: message }, { role: 'assistant', content: recordedReply });
      this.appendChat('assistant', recordedReply);
      this.setStatus('');
      return;
    }
    this.loading = true;
    this.setBusy(true, { typing: true });
    this.setStatus('Tavilo Coach is thinking…', 'busy');
    try {
      const auth = await resolveCoachIdToken(this.ipcRenderer);
      const result = await this.ipcRenderer.invoke('assistant:chat', {
        date: this.dateKey,
        message,
        history: this.history.slice(-8),
        idToken: auth?.idToken,
        organizationId: auth?.organizationId,
      });
      this.history.push({ role: 'user', content: message });
      if (!result?.success) {
        this.appendChat('assistant', result?.error || 'Could not reach Tavilo Coach right now.');
        this.setStatus(result?.error || 'Could not reach Tavilo Coach right now.', 'error');
        return;
      }
      const copy = result.data?.briefing || {};
      const reply = result.data?.reply || copy.summary || 'I could not form an answer from today’s stats.';
      this.history.push({ role: 'assistant', content: reply });
      this.appendChat('assistant', reply);
      this.renderPayload(result.data, { resetChat: false });
    } catch (err) {
      this.appendChat('assistant', 'Could not reach Tavilo Coach right now.');
      this.setStatus('Could not reach Tavilo Coach right now.', 'error');
    } finally {
      this.loading = false;
      this.setBusy(false);
    }
  }

  renderPayload(data, { resetChat }) {
    const stats = data?.stats || {};
    this.dateKey = data?.date || this.dateKey;
    const dateEl = document.getElementById('assistantDateLabel');
    if (dateEl) dateEl.textContent = formatDateLabel(this.dateKey, this.todayKey());
    const tz = document.getElementById('assistantTimezone');
    if (tz) tz.textContent = stats.timezone ? `Company day · ${stats.timezone}` : 'Company work day';

    this.paintTimes(stats);
    this.paintRecordedCopy(stats);

    const copy = data?.briefing || {};
    this.setCard('assistantScreenshotCopy', copy.screenshot_insights);
    this.setCard('assistantCoachingHeadline', stats.coaching?.headline || copy.greeting);
    const list = document.getElementById('assistantSuggestions');
    if (list) {
      const items = Array.isArray(copy.suggestions) ? copy.suggestions.filter(Boolean) : [];
      list.innerHTML = items.length
        ? items.map((item) => `<li>${renderSafeText(item)}</li>`).join('')
        : '<li>No suggestions yet for this day.</li>';
    }

    if (resetChat) {
      this.clearChat();
      const opening = liveOpening(stats, {
        live: this.dateKey === this.todayKey() ? readLiveTodaySplit() : null,
      });
      if (opening) this.appendChat('assistant', opening);
      this.history = opening ? [{ role: 'assistant', content: opening }] : [];
    }

    const next = document.getElementById('assistantNextDay');
    if (next) next.disabled = this.dateKey >= this.todayKey();

    this.paintStatus(stats);
  }

  recordedReply(message) {
    const stats = this._lastPayload?.date === this.dateKey ? this._lastPayload.stats : null;
    const live = this.dateKey === this.todayKey() ? readLiveTodaySplit() : null;
    return instantCoachReply(stats, message, live);
  }

  syncLiveToday() {
    if (!this._lastPayload || this.dateKey !== this.todayKey()) return;
    const stats = this._lastPayload.stats || {};
    this.paintTimes(stats);
    this.paintRecordedCopy(stats);
    this.paintStatus(stats);
    const onlyOpening = this.history.length === 1 && this.history[0]?.role === 'assistant';
    const ownedOpening = String(this.history[0]?.content || '').startsWith('Here is your recorded time.');
    if (!onlyOpening && !ownedOpening) return;
    const opening = liveOpening(stats, { live: readLiveTodaySplit() });
    if (opening && opening !== this.history[0]?.content) this.replaceFirstAssistantMessage(opening);
  }

  paintRecordedCopy(stats) {
    const live = this.dateKey === this.todayKey() ? readLiveTodaySplit() : null;
    const snap = recordedSnapshot(stats, live);
    this.setCard('assistantSummary', liveOpening(stats, { live }));
    this.setCard(
      'assistantEffectiveCopy',
      `Total time is ${spokenDuration(snap.total)}. Effective time is ${spokenDuration(snap.effective)}. Non-effective time is ${spokenDuration(snap.nonEffective)}.`,
    );
  }

  paintTimes(stats) {
    const live = this.dateKey === this.todayKey() ? readLiveTodaySplit() : null;
    const today = live || {
      total: hoursToSeconds(stats.tracked_hours ?? stats.hours_worked),
      effective: hoursToSeconds(stats.effective_hours),
      nonEffective: hoursToSeconds(stats.non_effective_hours),
    };
    const safeNon = Math.min(today.total, Math.max(0, today.nonEffective));
    this.setChip('assistantTracked', live ? formatClock(today.total) : formatCompact(today.total));
    this.setChip('assistantEffective', formatCompact(Math.max(0, today.total - safeNon)));
    this.setChip('assistantNonEffective', formatCompact(safeNon));

    const delta = live ? liveDelta(stats, { total: today.total, nonEffective: safeNon }) : null;
    const week = periodSplit(stats.coaching, 'week', delta);
    const month = periodSplit(stats.coaching, 'month', delta);
    this.setChip('assistantWeekTotal', formatCompact(week.total));
    this.setChip('assistantWeekEffective', formatCompact(week.effective));
    this.setChip('assistantWeekNonEffective', formatCompact(week.nonEffective));
    this.setChip('assistantMonthTotal', formatCompact(month.total));
    this.setChip('assistantMonthEffective', formatCompact(month.effective));
    this.setChip('assistantMonthNonEffective', formatCompact(month.nonEffective));
    const coaching = stats.coaching || {};
    const dailyHours = Number(stats.hours_threshold) || 0;
    this.paintPace('Week', paceCopy({
      effectiveSeconds: week.effective,
      expectedHours: coaching.week_expected_hours,
      targetHours: coaching.weekly_target_hours,
      finishedWeekdays: coaching.completed_weekdays,
      dailyHours,
      periodLabel: 'week',
    }));
    this.paintPace('Month', paceCopy({
      effectiveSeconds: month.effective,
      expectedHours: coaching.month_expected_hours,
      targetHours: coaching.month_target_hours,
      finishedWeekdays: coaching.month_completed_weekdays,
      dailyHours,
      periodLabel: 'month',
    }));
  }

  paintPace(which, pace) {
    const status = document.getElementById(`assistant${which}PaceStatus`);
    const detail = document.getElementById(`assistant${which}PaceDetail`);
    const bar = document.getElementById(`assistant${which}PaceBar`);
    if (status) {
      status.textContent = pace.status;
      status.classList.toggle('is-ahead', pace.tone === 'ahead');
      status.classList.toggle('is-behind', pace.tone === 'behind');
    }
    if (detail) detail.textContent = pace.detail;
    if (bar) {
      bar.style.width = `${pace.percent}%`;
      bar.classList.toggle('is-ahead', pace.tone === 'ahead');
      bar.classList.toggle('is-behind', pace.tone === 'behind');
    }
  }

  paintStatus(stats) {
    const live = this.dateKey === this.todayKey() ? readLiveTodaySplit() : null;
    const total = live ? live.total : hoursToSeconds(stats.tracked_hours ?? stats.hours_worked);
    const nonEffective = Math.min(
      total,
      live ? live.nonEffective : hoursToSeconds(stats.non_effective_hours),
    );
    const effective = Math.max(0, total - nonEffective);
    const month = periodSplit(stats.coaching, 'month', live ? liveDelta(stats, live) : null);
    const hasTime = total > 0 || month.total > 0;
    this.setStatus(
      hasTime
        ? `Today ${live ? formatClock(total) : formatCompact(total)} total time · ${formatCompact(effective)} effective time · ${formatCompact(nonEffective)} non-effective time`
        : 'No time synced for this day yet.',
    );
  }

  setChip(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  setCard(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = renderSafeText(text || '—');
  }

  setStatus(text, kind = 'info') {
    const el = document.getElementById('assistantStatus');
    if (!el) return;
    const copy = String(text || '').trim();
    el.textContent = copy;
    const isError = kind === 'error' || /could not/i.test(copy);
    const isBusy = kind === 'busy';
    el.classList.toggle('is-error', isError);
    el.classList.toggle('is-busy', isBusy && !isError);
    el.hidden = !copy;
  }

  setBusy(busy, { typing } = {}) {
    const page = document.querySelector('.assistant-page');
    const refresh = document.getElementById('assistantRefresh');
    const send = document.getElementById('assistantSend');
    const input = document.getElementById('assistantChatInput');
    page?.classList.toggle('is-busy', Boolean(busy));
    if (refresh) refresh.disabled = busy;
    if (send) send.disabled = busy;
    if (input) input.disabled = busy;
    document.querySelectorAll('[data-assistant-prompt]').forEach((btn) => {
      btn.disabled = Boolean(busy);
    });
    if (busy && typing) this.showTyping();
    else this.hideTyping();
  }

  syncEmpty() {
    const empty = document.getElementById('assistantChatEmpty');
    const log = document.getElementById('assistantChatLog');
    if (!empty || !log) return;
    empty.hidden = Boolean(log.querySelector('.assistant-msg'));
  }

  showTyping() {
    this.hideTyping();
    const log = document.getElementById('assistantChatLog');
    if (!log) return;
    const row = document.createElement('div');
    row.id = 'assistantTyping';
    row.className = 'assistant-msg assistant-msg-assistant is-typing';
    row.innerHTML =
      '<div class="assistant-msg-avatar" aria-hidden="true">T</div><div class="assistant-msg-body" aria-label="Tavilo Coach is thinking"><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span></div>';
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    this.syncEmpty();
  }

  hideTyping() {
    document.getElementById('assistantTyping')?.remove();
    this.syncEmpty();
  }

  clearChat() {
    const log = document.getElementById('assistantChatLog');
    if (log) log.innerHTML = '';
    this.syncEmpty();
  }

  replaceFirstAssistantMessage(text) {
    const copy = String(text || '').trim();
    if (!copy) return;
    try {
      const log = document.getElementById('assistantChatLog');
      const body = log?.querySelector('.assistant-msg-assistant:not(.is-typing) .assistant-msg-body');
      if (body) body.innerHTML = renderSafeText(copy);
      else if (log) this.appendChat('assistant', copy);
    } catch {
      /* document is absent in unit tests */
    }
    if (this.history[0]?.role === 'assistant') {
      this.history[0] = { role: 'assistant', content: copy };
    } else {
      this.history.unshift({ role: 'assistant', content: copy });
    }
  }

  appendChat(role, text) {
    this.hideTyping();
    const log = document.getElementById('assistantChatLog');
    if (!log) return;
    const row = document.createElement('div');
    row.className = `assistant-msg assistant-msg-${role}`;
    const avatar =
      role === 'user' ? '' : '<div class="assistant-msg-avatar" aria-hidden="true">A</div>';
    row.innerHTML = `${avatar}<div class="assistant-msg-body">${renderSafeText(text)}</div>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    this.syncEmpty();
  }
}

module.exports = AssistantCoach;
module.exports.escapeHtml = escapeHtml;
module.exports.hoursLabel = hoursLabel;
module.exports.shiftDateKey = shiftDateKey;
module.exports.renderSafeText = renderSafeText;
module.exports.formatDateLabel = formatDateLabel;
module.exports.hoursToSeconds = hoursToSeconds;
module.exports.formatClock = formatClock;
module.exports.formatCompact = formatCompact;
module.exports.periodSplit = periodSplit;
module.exports.liveDelta = liveDelta;
module.exports.readLiveTodaySplit = readLiveTodaySplit;
module.exports.instantCoachReply = instantCoachReply;
module.exports.paceCopy = paceCopy;
module.exports.liveOpening = liveOpening;
module.exports.recordedSnapshot = recordedSnapshot;
module.exports.resolveCoachIdToken = resolveCoachIdToken;
module.exports.resetCoachAuthCacheForTests = resetCoachAuthCacheForTests;
