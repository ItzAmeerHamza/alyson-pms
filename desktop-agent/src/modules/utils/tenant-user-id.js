/**
 * Palisade tenant.user ids are integers, not UUIDs.
 */

function isTenantUserId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

function normalizeTenantUserId(value) {
  const s = String(value ?? '').trim();
  if (!isTenantUserId(s)) {
    return null;
  }
  return s;
}

module.exports = {
  isTenantUserId,
  normalizeTenantUserId,
};
