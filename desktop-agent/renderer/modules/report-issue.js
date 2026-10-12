const { normalizeReport } = require('../../src/modules/utils/issue-report');
const { ProjectDropdown } = require('./project-dropdown');

function setStatus(node, kind, text) {
  if (!node) return;
  node.textContent = text;
  node.classList.remove('is-error', 'is-ok');
  if (kind) node.classList.add(kind);
}

function mountCategoryDropdown(select) {
  if (!select || select.dataset.ddMounted === '1') return null;
  const dropdown = new ProjectDropdown(select, {
    search: false,
    skipEmpty: false,
    placeholder: select.options?.[select.selectedIndex]?.textContent?.trim() || 'What is this about?',
  });
  dropdown.mount();
  select.dataset.ddMounted = '1';
  return dropdown;
}

function bindReportIssuePage(ipcRenderer, notificationManager) {
  if (typeof document === 'undefined') return;
  const form = document.getElementById('reportIssueForm');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';

  const message = document.getElementById('reportIssueMessage');
  const count = document.getElementById('reportIssueCount');
  const status = document.getElementById('reportIssueStatus');
  const submit = document.getElementById('reportIssueSubmit');
  const categorySelect = document.getElementById('reportIssueCategory');
  mountCategoryDropdown(categorySelect);

  const updateCount = () => {
    if (count && message) count.textContent = `${message.value.length} / 4000`;
  };
  message?.addEventListener('input', updateCount);
  updateCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const category = document.getElementById('reportIssueCategory')?.value || '';
    const includeDiagnostics = document.getElementById('reportIssueDiagnostics')?.checked !== false;
    const normalized = normalizeReport({
      category,
      message: message?.value || '',
      includeDiagnostics,
    });
    if (!normalized.ok) {
      setStatus(status, 'is-error', normalized.error);
      return;
    }

    if (submit) submit.disabled = true;
    setStatus(status, '', 'Sending…');
    try {
      const result = await ipcRenderer.invoke('report-issue:submit', {
        category: normalized.report.category,
        message: normalized.report.message,
        includeDiagnostics: normalized.report.include_diagnostics,
      });
      if (!result?.success) {
        setStatus(status, 'is-error', result?.error || 'Could not send the report. Try again.');
        return;
      }
      if (message) message.value = '';
      updateCount();
      setStatus(status, 'is-ok', 'Sent. Your team can see this in Pulse.');
      notificationManager?.showNotification?.('Issue report sent.', 'success');
    } catch {
      console.warn('[report-issue] submit failed');
      setStatus(status, 'is-error', 'Could not send the report. Try again.');
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

module.exports = { bindReportIssuePage, mountCategoryDropdown, setStatus };
