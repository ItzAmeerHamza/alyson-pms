import { describe, expect, it } from 'vitest';
import { isDbUnavailableError } from './db-unavailable';

describe('isDbUnavailableError', () => {
  it('matches Postgres too-many-connections', () => {
    expect(isDbUnavailableError({ code: '53300', message: 'sorry, too many clients already' })).toBe(
      true,
    );
    expect(isDbUnavailableError(new Error('too many connections for role "alyson"'))).toBe(true);
  });

  it('does not treat a normal constraint error as unavailable', () => {
    expect(isDbUnavailableError({ code: '23505', message: 'duplicate key' })).toBe(false);
  });

  it('treats a statement timeout as unavailable so the agent gets 503, not ISE', () => {
    expect(
      isDbUnavailableError({
        code: '57014',
        message: 'canceling statement due to statement timeout',
      }),
    ).toBe(true);
    expect(isDbUnavailableError(new Error('canceling statement due to statement timeout'))).toBe(
      true,
    );
  });

  it('treats serialization_failure as unavailable', () => {
    expect(isDbUnavailableError({ code: '40001', message: 'could not serialize access' })).toBe(
      true,
    );
  });
});
