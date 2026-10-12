import { BadRequestException, HttpException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IssueReportsService } from './issue-reports.service';

const employee = {
  id: '4',
  email: 'asha@tavilo.ai',
  full_name: 'Asha',
  role: 'employee',
  organization_id: '10',
};

function makeService(
  handlers: Array<(sql: string, params?: unknown[]) => unknown>,
  options: { reportTo?: string; sendImpl?: () => Promise<unknown> } = {},
) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const handler = handlers.shift();
    if (!handler) throw new Error(`unexpected query: ${sql}`);
    return handler(sql, params);
  });
  const send = vi.fn(options.sendImpl || (async () => ({ messageId: 'ok' })));
  const config = { get: vi.fn(() => options.reportTo ?? 'ops@tavilo.ai') };
  const service = new IssueReportsService(
    { query } as never,
    { send } as never,
    config as never,
  );
  return { service, query, send };
}

const report = {
  category: 'tracking' as const,
  message: 'The timer stopped while I was working.',
  include_diagnostics: true,
  diagnostics: 'health: ok',
  app_version: '1.0.248',
  platform: 'darwin',
  os_summary: 'Darwin 24',
};

describe('IssueReportsService', () => {
  it('stores a report and emails admins, including a reporting admin', async () => {
    const { service, send } = makeService([
      () => ({ rows: [{ n: '0' }] }),
      (sql, params) => {
        expect(sql).toContain('INSERT INTO time_doctor.issue_reports');
        expect(params?.[0]).toBe(4);
        expect(params?.[1]).toBe(10);
        expect(params?.[3]).toBe(report.message);
        expect(params?.[5]).toBe('health: ok');
        return { rows: [{ id: 'rep-1', created_at: new Date('2026-10-12T00:00:00.000Z') }] };
      },
      () => ({ rows: [{ email: 'admin@tavilo.ai' }, { email: 'asha@tavilo.ai' }] }),
    ]);

    const result = await service.create(employee, report);
    expect(result).toEqual({ id: 'rep-1', created_at: '2026-10-12T00:00:00.000Z' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@tavilo.ai', 'asha@tavilo.ai', 'ops@tavilo.ai'],
        subject: 'Tavilo Time issue: Time tracking',
      }),
    );
  });

  it('drops diagnostics when the user did not include them', async () => {
    const { service, send } = makeService([
      () => ({ rows: [{ n: '1' }] }),
      (_sql, params) => {
        expect(params?.[4]).toBe(false);
        expect(params?.[5]).toBeNull();
        return { rows: [{ id: 'rep-2', created_at: '2026-10-12T00:00:00.000Z' }] };
      },
      () => ({ rows: [] }),
    ]);

    await service.create(employee, { ...report, include_diagnostics: false, diagnostics: 'secret log' });
    expect(send.mock.calls[0][0].text).not.toContain('secret log');
  });

  it('strips tokens from the stored message', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturevalue';
    const { service } = makeService([
      () => ({ rows: [{ n: '0' }] }),
      (_sql, params) => {
        expect(String(params?.[3])).not.toContain(jwt);
        expect(String(params?.[3])).toContain('[redacted]');
        expect(String(params?.[5])).not.toContain('Bearer raw-secret');
        return { rows: [{ id: 'rep-3', created_at: '2026-10-12T00:00:00.000Z' }] };
      },
      () => ({ rows: [] }),
    ]);

    await service.create(employee, {
      ...report,
      message: `Timer failed after I pasted ${jwt} into the notes field today.`,
      diagnostics: 'Authorization: Bearer raw-secret',
    });
  });

  it('rejects a description that is too short before touching the database', async () => {
    const { service, query } = makeService([]);
    await expect(service.create(employee, { ...report, message: '   too short  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a user id that is not a tenant integer', async () => {
    const { service, query } = makeService([]);
    await expect(service.create({ ...employee, id: 'not-a-number' }, report)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the home workspace when the session has no company selected', async () => {
    const { service } = makeService([
      () => ({ rows: [{ organization_id: '22' }] }),
      () => ({ rows: [{ n: '0' }] }),
      (_sql, params) => {
        expect(params?.[1]).toBe(22);
        return { rows: [{ id: 'rep-4', created_at: '2026-10-12T00:00:00.000Z' }] };
      },
      () => ({ rows: [{ email: 'admin@tavilo.ai' }] }),
    ]);

    const result = await service.create({ ...employee, organization_id: null }, report);
    expect(result.id).toBe('rep-4');
  });

  it('still saves the report when the notification email fails', async () => {
    const { service } = makeService(
      [
        () => ({ rows: [{ n: '0' }] }),
        () => ({ rows: [{ id: 'rep-5', created_at: '2026-10-12T00:00:00.000Z' }] }),
        () => ({ rows: [{ email: 'admin@tavilo.ai' }] }),
      ],
      { sendImpl: async () => { throw new Error('SES mailbox missing'); } },
    );

    await expect(service.create(employee, report)).resolves.toEqual({
      id: 'rep-5',
      created_at: '2026-10-12T00:00:00.000Z',
    });
  });

  it('stores the report without emailing when nobody is configured to receive it', async () => {
    const { service, send } = makeService(
      [
        () => ({ rows: [{ n: '0' }] }),
        () => ({ rows: [{ id: 'rep-6', created_at: '2026-10-12T00:00:00.000Z' }] }),
        () => ({ rows: [] }),
      ],
      { reportTo: '' },
    );

    await expect(service.create(employee, report)).resolves.toMatchObject({ id: 'rep-6' });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops a burst of reports', async () => {
    const { service, send } = makeService([() => ({ rows: [{ n: '8' }] })]);
    await expect(service.create(employee, report)).rejects.toBeInstanceOf(HttpException);
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps database failures generic', async () => {
    const { service } = makeService([() => ({ rows: [{ n: '0' }] }), () => {
      throw new Error('password authentication failed for user secret');
    }]);
    try {
      await service.create(employee, report);
      throw new Error('expected failure');
    } catch (err) {
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect((err as Error).message).toBe('Could not send the report right now.');
      expect((err as Error).message).not.toContain('secret');
    }
  });

  it('lists recent reports for one company and caps the page size', async () => {
    const { service } = makeService([
      (sql, params) => {
        expect(sql).toContain('WHERE workspace_id = $1');
        expect(params).toEqual([10, 200]);
        return { rows: [{ id: 'rep-1', message: 'Timer stopped' }] };
      },
    ]);
    await expect(service.list(10, 999)).resolves.toEqual([{ id: 'rep-1', message: 'Timer stopped' }]);
  });

  it('hides database errors when the inbox cannot be loaded', async () => {
    const { service } = makeService([() => {
      throw new Error('relation time_doctor.issue_reports does not exist');
    }]);
    await expect(service.list(10)).rejects.toMatchObject({
      message: 'Could not load issue reports.',
    });
  });
});
