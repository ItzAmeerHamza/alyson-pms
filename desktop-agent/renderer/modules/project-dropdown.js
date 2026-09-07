/**
 * Smooth custom project picker synced to the native #projectSelect.
 * Keeps existing IPC / Start button logic that reads the <select>.
 */

class ProjectDropdown {
  constructor(selectEl, options = {}) {
    this.select = selectEl;
    this.searchEnabled = options.search !== false;
    this.skipEmpty = options.skipEmpty !== false;
    this.placeholder = options.placeholder || 'Choose a project to track time...';
    this.open = false;
    this.root = null;
    this.trigger = null;
    this.triggerLabel = null;
    this.menu = null;
    this.searchInput = null;
    this.optionsList = null;
    this._onDocPointer = (e) => {
      if (!this.open || !this.root) return;
      if (!this.root.contains(e.target)) this.close();
    };
    this._onKey = (e) => {
      if (!this.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close(true);
      }
    };
  }

  mount() {
    if (!this.select || this.root) return;

    const wrap = document.createElement('div');
    wrap.className = 'project-dd';
    wrap.setAttribute('data-project-dd', '1');

    this.select.classList.add('project-dd-native');
    this.select.setAttribute('aria-hidden', 'true');
    this.select.tabIndex = -1;

    wrap.innerHTML = `
      <button type="button" class="project-dd-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="project-dd-trigger-label">${this.placeholder}</span>
        <span class="project-dd-chevron" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
      </button>
      <div class="project-dd-menu" role="listbox" hidden>
        ${this.searchEnabled ? `
        <div class="project-dd-search-wrap">
          <input type="search" class="project-dd-search" placeholder="Search projects..." autocomplete="off" />
        </div>` : ''}
        <div class="project-dd-options"></div>
        ${this.searchEnabled ? `<div class="project-dd-empty" hidden>No matching projects</div>` : ''}
      </div>
    `;

    this.select.parentNode.insertBefore(wrap, this.select);
    wrap.appendChild(this.select);

    this.root = wrap;
    this.trigger = wrap.querySelector('.project-dd-trigger');
    this.triggerLabel = wrap.querySelector('.project-dd-trigger-label');
    this.menu = wrap.querySelector('.project-dd-menu');
    this.searchInput = wrap.querySelector('.project-dd-search');
    this.optionsList = wrap.querySelector('.project-dd-options');
    this.emptyEl = wrap.querySelector('.project-dd-empty');

    this.trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.select.disabled) return;
      this.open ? this.close() : this.show();
    });

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this._filter(this.searchInput.value));
      this.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const first = this.optionsList.querySelector('.project-dd-option:not([hidden])');
          first?.focus();
        }
      });
    }

    this.select.addEventListener('change', () => this.syncFromSelect());

    // Observe option list changes from loadMainAppProjects
    this._observer = new MutationObserver(() => this.rebuildOptions());
    this._observer.observe(this.select, { childList: true });

    this.rebuildOptions();
    this.syncFromSelect();
  }

  rebuildOptions() {
    if (!this.optionsList || !this.select) return;
    const frag = document.createDocumentFragment();
    const options = Array.from(this.select.options || []);

    options.forEach((opt) => {
      if (this.skipEmpty && !opt.value) return;
      if (opt.disabled) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'project-dd-option';
      btn.setAttribute('role', 'option');
      btn.dataset.value = opt.value;
      btn.dataset.label = (opt.textContent || '').trim();
      btn.textContent = (opt.textContent || '').trim();
      btn.tabIndex = -1;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._choose(opt.value);
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._choose(opt.value);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._focusSibling(btn, 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._focusSibling(btn, -1);
        }
      });

      frag.appendChild(btn);
    });

    this.optionsList.replaceChildren(frag);
    this.syncFromSelect();
    if (this.open) this._filter(this.searchInput?.value || '');
  }

  _focusSibling(el, dir) {
    const visible = Array.from(
      this.optionsList.querySelectorAll('.project-dd-option:not([hidden])'),
    );
    const idx = visible.indexOf(el);
    const next = visible[idx + dir];
    next?.focus();
  }

  _choose(value) {
    if (!this.select) return;
    const prev = this.select.value;
    this.select.value = value;
    this.syncFromSelect();
    this.close(true);
    if (prev !== value) {
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  syncFromSelect() {
    if (!this.select || !this.triggerLabel) return;
    const selected = this.select.selectedOptions?.[0];
    const hasValue = !!(selected && !selected.disabled && (this.select.value || !this.skipEmpty));
    const label = hasValue
      ? (selected.textContent || '').trim()
      : this.placeholder;

    this.triggerLabel.textContent = label;
    this.triggerLabel.classList.toggle('is-placeholder', !hasValue);
    this.root?.classList.toggle('has-value', hasValue);
    this.trigger?.classList.toggle('is-disabled', !!this.select.disabled);

    this.optionsList?.querySelectorAll('.project-dd-option').forEach((btn) => {
      const active = btn.dataset.value === this.select.value;
      btn.classList.toggle('is-selected', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  show() {
    if (!this.menu || this.open || this.select?.disabled) return;
    this.rebuildOptions();
    this.open = true;
    this.root.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.menu.hidden = false;
    // Force reflow so enter transition runs
    void this.menu.offsetHeight;
    this.menu.classList.add('is-visible');
    if (this.searchInput) {
      this.searchInput.value = '';
      this._filter('');
      requestAnimationFrame(() => this.searchInput.focus());
    } else {
      requestAnimationFrame(() => {
        const selected = this.optionsList?.querySelector('.project-dd-option.is-selected');
        (selected || this.optionsList?.querySelector('.project-dd-option'))?.focus();
      });
    }
    document.addEventListener('pointerdown', this._onDocPointer, true);
    document.addEventListener('keydown', this._onKey, true);
  }

  close(focusTrigger = false) {
    if (!this.menu || !this.open) return;
    this.open = false;
    this.root.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.menu.classList.remove('is-visible');
    document.removeEventListener('pointerdown', this._onDocPointer, true);
    document.removeEventListener('keydown', this._onKey, true);

    const finish = () => {
      if (!this.open) this.menu.hidden = true;
    };
    this.menu.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 220);

    if (focusTrigger) this.trigger?.focus();
  }

  _filter(query) {
    const q = String(query || '').trim().toLowerCase();
    let visible = 0;
    this.optionsList?.querySelectorAll('.project-dd-option').forEach((btn) => {
      const match = !q || (btn.dataset.label || '').toLowerCase().includes(q);
      btn.hidden = !match;
      if (match) visible += 1;
    });
    if (this.emptyEl) this.emptyEl.hidden = visible > 0;
  }

  destroy() {
    this.close();
    this._observer?.disconnect();
    document.removeEventListener('pointerdown', this._onDocPointer, true);
    document.removeEventListener('keydown', this._onKey, true);
  }
}

let instance = null;
const screenshotDropdowns = new Map();

function initProjectDropdown() {
  const select = document.getElementById('projectSelect');
  if (!select) return null;
  if (instance) {
    instance.rebuildOptions();
    instance.syncFromSelect();
    return instance;
  }
  instance = new ProjectDropdown(select);
  instance.mount();
  return instance;
}

function refreshProjectDropdown() {
  if (instance) {
    instance.rebuildOptions();
    instance.syncFromSelect();
  } else {
    initProjectDropdown();
  }
}

function initScreenshotFilterDropdowns() {
  ['activityFilter', 'limitSelect'].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const existing = screenshotDropdowns.get(id);
    if (existing?.select === select && existing.root?.isConnected) {
      existing.rebuildOptions();
      existing.syncFromSelect();
      return;
    }
    existing?.destroy();
    const dd = new ProjectDropdown(select, {
      search: false,
      skipEmpty: false,
      placeholder: select.options[select.selectedIndex]?.textContent?.trim() || 'Select…',
    });
    dd.mount();
    if (!select.dataset.screenshotFilterBound) {
      select.dataset.screenshotFilterBound = '1';
      select.addEventListener('change', () => {
        if (typeof window.loadRecentScreenshots === 'function') {
          window.loadRecentScreenshots({ force: true });
        }
      });
    }
    screenshotDropdowns.set(id, dd);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initProjectDropdown,
    refreshProjectDropdown,
    initScreenshotFilterDropdowns,
    ProjectDropdown,
  };
}

window.initProjectDropdown = initProjectDropdown;
window.refreshProjectDropdown = refreshProjectDropdown;
window.initScreenshotFilterDropdowns = initScreenshotFilterDropdowns;
