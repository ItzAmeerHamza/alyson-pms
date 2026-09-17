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

async function resolveCoachIdToken(ipcRenderer, cognitoAuth = require('./cognito-auth')) {
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
  return {
    idToken: session.idToken,
    organizationId: user.organization_id || disk?.organization_id || null,
  };
}

class AssistantCoach {
  constructor(ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.dateKey = workDateKey();
    this.history = [];
    this.loading = false;
    this.bound = false;
  }

  open() {
    this.bindOnce();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    this.refresh();
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

  shiftDay(delta) {
    const next = shiftDateKey(this.dateKey, delta);
    if (next > this.todayKey()) return;
    this.dateKey = next;
    this.history = [];
    this.clearChat();
    this.refresh({ force: true });
  }

  async refresh(opts = {}) {
    if (this.loading && !opts.force) return;
    this.loading = true;
    this.setStatus('Reading your month so far…', 'busy');
    this.setBusy(true, { typing: true });
    try {
      const auth = await resolveCoachIdToken(this.ipcRenderer);
      const result = await this.ipcRenderer.invoke('assistant:briefing', {
        date: this.dateKey,
        idToken: auth?.idToken,
        organizationId: auth?.organizationId,
      });
      if (!result?.success) {
        this.setStatus(result?.error || 'Could not load Alyson Coach right now.', 'error');
        return;
      }
      this.renderPayload(result.data, { resetChat: true });
    } catch (err) {
      this.setStatus('Could not load Alyson Coach right now.', 'error');
    } finally {
      this.loading = false;
      this.setBusy(false);
    }
  }

  async sendChat(preset) {
    const input = document.getElementById('assistantChatInput');
    const message = String(preset || input?.value || '').trim();
    if (!message || this.loading) return;
    if (input) input.value = '';
    this.appendChat('user', message);
    this.loading = true;
    this.setBusy(true, { typing: true });
    this.setStatus('Alyson is thinking…', 'busy');
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
        this.appendChat('assistant', result?.error || 'Could not reach Alyson Coach right now.');
        this.setStatus(result?.error || 'Could not reach Alyson Coach right now.', 'error');
        return;
      }
      const copy = result.data?.briefing || {};
      const reply = result.data?.reply || copy.summary || 'I could not form an answer from today’s stats.';
      this.history.push({ role: 'assistant', content: reply });
      this.appendChat('assistant', reply);
      this.renderPayload(result.data, { resetChat: false });
    } catch (err) {
      this.appendChat('assistant', 'Could not reach Alyson Coach right now.');
      this.setStatus('Could not reach Alyson Coach right now.', 'error');
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

    this.setChip('assistantTracked', hoursLabel(stats.hours_worked ?? stats.tracked_hours));
    this.setChip('assistantEffective', hoursLabel(stats.effective_hours));
    this.setChip('assistantNonEffective', hoursLabel(stats.non_effective_hours));
    this.setChip('assistantIdle', hoursLabel(stats.idle_hours));
    this.setChip('assistantLow', hoursLabel(stats.low_activity_hours));
    this.setChip(
      'assistantShots',
      `${Number(stats.screenshots?.analyzed) || 0}/${Number(stats.screenshots?.total) || 0} analyzed`,
    );
    this.setChip('assistantWeekEffective', hoursLabel(stats.coaching?.week_effective_hours));
    this.setChip('assistantWeekExpected', hoursLabel(stats.coaching?.week_expected_hours));
    this.setChip('assistantMonthEffective', hoursLabel(stats.coaching?.month_effective_hours));
    this.setChip('assistantMonthExpected', hoursLabel(stats.coaching?.month_expected_hours));

    const copy = data?.briefing || {};
    this.setCard('assistantSummary', copy.summary);
    this.setCard('assistantEffectiveCopy', copy.effective_breakdown);
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
      const opening =
        String(data?.opening || '').trim() ||
        [copy.greeting, copy.summary].filter(Boolean).join('\n\n');
      if (opening) this.appendChat('assistant', opening);
      this.history = opening ? [{ role: 'assistant', content: opening }] : [];
    }

    const next = document.getElementById('assistantNextDay');
    if (next) next.disabled = this.dateKey >= this.todayKey();

    const worked = Number(stats.hours_worked ?? stats.tracked_hours) || 0;
    const monthEff = hoursLabel(stats.coaching?.month_effective_hours);
    this.setStatus(
      worked > 0 || Number(stats.coaching?.month_hours_worked) > 0
        ? `This month: ${monthEff} effective · today ${hoursLabel(worked)} worked · ${hoursLabel(stats.effective_hours)} effective${
            stats.coaching?.headline ? ` · ${stats.coaching.headline}` : ''
          }`
        : 'No tracked time synced for this month yet.',
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
      '<div class="assistant-msg-avatar" aria-hidden="true">A</div><div class="assistant-msg-body" aria-label="Alyson is thinking"><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span><span class="assistant-typing-dot"></span></div>';
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
module.exports.resolveCoachIdToken = resolveCoachIdToken;
