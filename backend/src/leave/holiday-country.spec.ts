import { describe, expect, it } from 'vitest';
import {
  canonicalCountry,
  countriesMatch,
  countryFromOffice,
  resolveHolidayCountry,
} from './holiday-country';

describe('holiday country', () => {
  it('maps Pune office copy to India', () => {
    expect(countryFromOffice('Pune')).toBe('India');
    expect(
      resolveHolidayCountry({
        text: 'Pune Office Closed for Janmashtami - 4th September ,2026',
      }),
    ).toBe('India');
  });

  it('maps Pakistan cities', () => {
    expect(countryFromOffice('Lahore')).toBe('Pakistan');
    expect(canonicalCountry('pakistan')).toBe('Pakistan');
  });

  it('matches employee country to a holiday', () => {
    expect(countriesMatch('India', 'india')).toBe(true);
    expect(countriesMatch('Pakistan', 'India')).toBe(false);
    expect(countriesMatch(null, 'India')).toBe(false);
  });
});
