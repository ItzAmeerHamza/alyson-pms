const OFFICE_TO_COUNTRY: Record<string, string> = {
  pune: 'India',
  mumbai: 'India',
  bangalore: 'India',
  bengaluru: 'India',
  hyderabad: 'India',
  delhi: 'India',
  'new delhi': 'India',
  noida: 'India',
  gurgaon: 'India',
  gurugram: 'India',
  chennai: 'India',
  kolkata: 'India',
  karachi: 'Pakistan',
  lahore: 'Pakistan',
  islamabad: 'Pakistan',
  rawalpindi: 'Pakistan',
};

const COUNTRY_ALIASES: Record<string, string> = {
  india: 'India',
  pakistan: 'Pakistan',
  usa: 'United States',
  us: 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
  britain: 'United Kingdom',
  uae: 'United Arab Emirates',
  'united arab emirates': 'United Arab Emirates',
};

export function normCountry(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function canonicalCountry(value: unknown): string | null {
  const raw = normCountry(value);
  if (!raw) return null;
  return COUNTRY_ALIASES[raw.toLowerCase()] || raw;
}

export function countryFromOffice(office: unknown): string | null {
  const raw = normCountry(office);
  if (!raw) return null;
  return OFFICE_TO_COUNTRY[raw.toLowerCase()] || null;
}

/** Prefer an explicit country; else map a city/office name (Pune → India). */
export function resolveHolidayCountry(input: {
  country?: unknown;
  office?: unknown;
  text?: unknown;
}): string | null {
  const fromCountry = canonicalCountry(input.country);
  if (fromCountry) return fromCountry;
  const fromOffice = countryFromOffice(input.office);
  if (fromOffice) return fromOffice;

  const blob = String(input.text || '').toLowerCase();
  for (const [office, country] of Object.entries(OFFICE_TO_COUNTRY)) {
    if (blob.includes(office)) return country;
  }
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (alias.length > 2 && blob.includes(alias)) return country;
  }
  return null;
}

export function countriesMatch(employeeCountry: unknown, leaveCountry: unknown): boolean {
  const a = canonicalCountry(employeeCountry);
  const b = canonicalCountry(leaveCountry);
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
