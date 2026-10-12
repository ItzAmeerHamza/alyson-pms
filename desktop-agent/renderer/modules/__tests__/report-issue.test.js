jest.mock('../project-dropdown', () => ({
  ProjectDropdown: jest.fn().mockImplementation(() => ({ mount: jest.fn() })),
}));

const { ProjectDropdown } = require('../project-dropdown');
const { bindReportIssuePage } = require('../report-issue');

function createEl(initial = {}) {
  const listeners = {};
  return {
    value: initial.value ?? '',
    checked: initial.checked ?? false,
    disabled: false,
    textContent: initial.textContent ?? '',
    options: initial.options,
    selectedIndex: initial.selectedIndex ?? 0,
    dataset: {},
    classList: {
      classes: new Set(),
      add(name) { this.classes.add(name); },
      remove(...names) { names.forEach((name) => this.classes.delete(name)); },
      contains(name) { return this.classes.has(name); },
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    emit(type, event = {}) {
      (listeners[type] || []).forEach((fn) => fn(event));
    },
  };
}

function mountForm({ checked = true, category = 'tracking', message = '' } = {}) {
  const categorySelect = createEl({
    value: category,
    options: [{ textContent: 'Time tracking' }],
    selectedIndex: 0,
  });
  const fields = {
    reportIssueForm: createEl(),
    reportIssueMessage: createEl({ value: message }),
    reportIssueCount: createEl(),
    reportIssueStatus: createEl(),
    reportIssueSubmit: createEl(),
    reportIssueCategory: categorySelect,
    reportIssueDiagnostics: createEl({ checked }),
  };
  global.document = {
    getElementById: (id) => fields[id] || null,
  };
  const ipcRenderer = { invoke: jest.fn(async () => ({ success: true, id: 'rep-1' })) };
  const notificationManager = { showNotification: jest.fn() };
  bindReportIssuePage(ipcRenderer, notificationManager);
  return { fields, ipcRenderer, notificationManager };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function submit(form) {
  form.emit('submit', { preventDefault() {} });
  await flush();
}

describe('report issue form', () => {
  afterEach(() => {
    delete global.document;
    jest.clearAllMocks();
  });

  it('uses the same custom dropdown as the other selectors', () => {
    const { fields } = mountForm();
    expect(ProjectDropdown).toHaveBeenCalledWith(
      fields.reportIssueCategory,
      expect.objectContaining({ search: false, skipEmpty: false, placeholder: 'Time tracking' }),
    );
    expect(fields.reportIssueCategory.dataset.ddMounted).toBe('1');
  });

  it('does not mount the dropdown twice', () => {
    const { fields, ipcRenderer, notificationManager } = mountForm();
    bindReportIssuePage(ipcRenderer, notificationManager);
    expect(ProjectDropdown).toHaveBeenCalledTimes(1);
    expect(fields.reportIssueForm.dataset.bound).toBe('1');
  });

  it('updates the character count as the description changes', () => {
    const { fields } = mountForm();
    fields.reportIssueMessage.value = 'hello';
    fields.reportIssueMessage.emit('input');
    expect(fields.reportIssueCount.textContent).toBe('5 / 4000');
  });

  it('blocks a short description and does not send it', async () => {
    const { fields, ipcRenderer } = mountForm({ message: 'too short' });
    await submit(fields.reportIssueForm);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(fields.reportIssueStatus.textContent).toMatch(/few words/i);
    expect(fields.reportIssueStatus.classList.contains('is-error')).toBe(true);
    expect(fields.reportIssueSubmit.disabled).toBe(false);
  });

  it('blocks an unknown category', async () => {
    const { fields, ipcRenderer } = mountForm({
      category: 'payroll',
      message: 'The timer stopped while I was working.',
    });
    await submit(fields.reportIssueForm);
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(fields.reportIssueStatus.textContent).toMatch(/what the issue/i);
  });

  it.each([
    ['tracking', true],
    ['screenshots', true],
    ['login', false],
    ['permissions', true],
    ['updates', false],
    ['other', true],
  ])('sends a %s report with diagnostics %s', async (category, includeDiagnostics) => {
    const { fields, ipcRenderer, notificationManager } = mountForm({
      category,
      checked: includeDiagnostics,
      message: 'The timer stopped while I was working.',
    });
    await submit(fields.reportIssueForm);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('report-issue:submit', {
      category,
      message: 'The timer stopped while I was working.',
      includeDiagnostics,
    });
    expect(fields.reportIssueMessage.value).toBe('');
    expect(fields.reportIssueCount.textContent).toBe('0 / 4000');
    expect(fields.reportIssueStatus.textContent).toMatch(/Sent/);
    expect(fields.reportIssueStatus.classList.contains('is-ok')).toBe(true);
    expect(notificationManager.showNotification).toHaveBeenCalledWith('Issue report sent.', 'success');
    expect(fields.reportIssueSubmit.disabled).toBe(false);
  });

  it('shows the server message and keeps the description when sending fails', async () => {
    const { fields, ipcRenderer } = mountForm({
      message: 'Screenshots stopped after the display slept.',
    });
    ipcRenderer.invoke.mockResolvedValue({
      success: false,
      error: 'You have sent several reports recently. Try again in a little while.',
    });
    await submit(fields.reportIssueForm);
    expect(fields.reportIssueMessage.value).toBe('Screenshots stopped after the display slept.');
    expect(fields.reportIssueStatus.textContent).toMatch(/several reports/i);
    expect(fields.reportIssueStatus.classList.contains('is-error')).toBe(true);
  });

  it('shows a generic error when the desktop bridge throws', async () => {
    const { fields, ipcRenderer } = mountForm({
      message: 'The update downloaded but never installed.',
    });
    ipcRenderer.invoke.mockRejectedValue(new Error('ipc channel missing'));
    await submit(fields.reportIssueForm);
    expect(fields.reportIssueStatus.textContent).toBe('Could not send the report. Try again.');
    expect(fields.reportIssueStatus.textContent).not.toContain('ipc channel');
    expect(fields.reportIssueMessage.value).toBe('The update downloaded but never installed.');
  });

  it('disables the button while the report is in flight', async () => {
    const { fields, ipcRenderer } = mountForm({
      message: 'Accessibility stays denied after I allow it.',
    });
    let finish;
    ipcRenderer.invoke.mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
    }));
    const pending = submit(fields.reportIssueForm);
    await Promise.resolve();
    expect(fields.reportIssueSubmit.disabled).toBe(true);
    expect(fields.reportIssueStatus.textContent).toBe('Sending…');
    finish({ success: true, id: 'rep-2' });
    await pending;
    expect(fields.reportIssueSubmit.disabled).toBe(false);
  });

  it('sends once when the page is opened twice', async () => {
    const { fields, ipcRenderer, notificationManager } = mountForm({
      message: 'Forgot password never emailed a code.',
    });
    bindReportIssuePage(ipcRenderer, notificationManager);
    await submit(fields.reportIssueForm);
    expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
  });
});
