/**
 * Domain Filter Helper
 * Provides consistent domain filtering across frontend and backend
 */

/**
 * Normalize domain for case-insensitive comparison
 * @param {string} domain - Domain to normalize
 * @returns {string} Lowercase domain
 */
function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return '';
  return domain.toLowerCase().trim();
}

/**
 * Create SQL WHERE clause for domain filtering
 * @param {string} column - Column name (e.g., 'domain')
 * @param {string} value - Domain value to filter
 * @returns {string} SQL WHERE clause
 */
function domainWhereClause(column = 'domain', value) {
  if (!value) return '1=1'; // No filter
  return `lower(${column}) = lower($1)`;
}

/**
 * Filter domains in JavaScript array
 * @param {Array} items - Array of items with domain property
 * @param {string} filterDomain - Domain to filter by
 * @returns {Array} Filtered items
 */
function filterByDomain(items, filterDomain) {
  if (!filterDomain || !Array.isArray(items)) return items;
  const normalized = normalizeDomain(filterDomain);
  return items.filter(item => 
    normalizeDomain(item.domain) === normalized
  );
}

/**
 * Convert IDN (Internationalized Domain Name) to ASCII (Punycode)
 * @param {string} domain - Domain that may contain Unicode
 * @returns {string} ASCII representation of domain
 */
function domainToAscii(domain) {
  try {
    const url = new URL(`https://${domain}`);
    return url.hostname; // This automatically converts to punycode
  } catch {
    return domain;
  }
}

/**
 * Check if two domains are equivalent (handles IDN)
 * @param {string} domain1 - First domain
 * @param {string} domain2 - Second domain
 * @returns {boolean} True if domains are equivalent
 */
function domainsEqual(domain1, domain2) {
  const norm1 = normalizeDomain(domain1);
  const norm2 = normalizeDomain(domain2);
  
  // Direct comparison
  if (norm1 === norm2) return true;
  
  // Try ASCII conversion for IDN support
  const ascii1 = domainToAscii(norm1);
  const ascii2 = domainToAscii(norm2);
  
  return ascii1 === ascii2;
}

module.exports = {
  normalizeDomain,
  domainWhereClause,
  filterByDomain,
  domainToAscii,
  domainsEqual
};
