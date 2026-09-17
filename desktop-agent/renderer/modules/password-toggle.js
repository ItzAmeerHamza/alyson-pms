function wirePasswordToggle(input, btn) {
  if (!input || !btn || btn.dataset.passwordToggleWired === '1') return;
  btn.dataset.passwordToggleWired = '1';
  const setState = (show) => {
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('is-showing', show);
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
  };
  setState(false);
  btn.addEventListener('click', (event) => {
    if (event?.preventDefault) event.preventDefault();
    setState(input.type === 'password');
  });
  btn.closest?.('form')?.addEventListener('reset', () => setState(false));
}

function wirePasswordToggles(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc?.getElementById) return;
  wirePasswordToggle(doc.getElementById('loginPassword'), doc.getElementById('toggleLoginPassword'));
  doc.querySelectorAll?.('[data-password-toggle]').forEach((btn) => {
    wirePasswordToggle(doc.getElementById(btn.getAttribute('data-password-toggle')), btn);
  });
}

module.exports = {
  wirePasswordToggle,
  wirePasswordToggles,
};
