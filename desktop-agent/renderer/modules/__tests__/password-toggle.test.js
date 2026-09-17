const { wirePasswordToggle } = require('../password-toggle');

function makeToggle() {
  const classSet = new Set();
  const input = { type: 'password' };
  const btn = {
    dataset: {},
    classList: {
      toggle(name, on) {
        if (on) classSet.add(name);
        else classSet.delete(name);
      },
      contains(name) {
        return classSet.has(name);
      },
    },
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    listeners: {},
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    },
    closest() {
      return null;
    },
  };
  return { input, btn, classSet };
}

describe('password visibility toggle', () => {
  it('shows a slashed eye while the password is visible', () => {
    const { input, btn } = makeToggle();
    wirePasswordToggle(input, btn);

    expect(input.type).toBe('password');
    expect(btn.classList.contains('is-showing')).toBe(false);

    btn.listeners.click({ preventDefault() {} });

    expect(input.type).toBe('text');
    expect(btn.classList.contains('is-showing')).toBe(true);
    expect(btn.attrs['aria-label']).toBe('Hide password');

    btn.listeners.click({ preventDefault() {} });

    expect(input.type).toBe('password');
    expect(btn.classList.contains('is-showing')).toBe(false);
    expect(btn.attrs['aria-label']).toBe('Show password');
  });
});
