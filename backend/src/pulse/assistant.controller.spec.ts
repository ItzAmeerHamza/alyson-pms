import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AssistantController } from './assistant.controller';

const employee = { id: '4', role: 'employee', organization_id: '10' };
const superAdmin = { id: '9', role: 'employee', is_super_admin: true };

function makeController() {
  const assistant = {
    briefing: vi.fn(async (_user, date?: string) => ({ date: date || 'today', stats: { tracked_hours: 1 } })),
    chat: vi.fn(async (_user, opts: { message: string }) => ({ reply: opts.message })),
  };
  return {
    controller: new AssistantController(assistant as never),
    assistant,
  };
}

describe('AssistantController', () => {
  it('loads a briefing for the signed-in employee', async () => {
    const { controller, assistant } = makeController();
    await controller.briefing({ user: employee }, { date: '2026-09-17' });
    expect(assistant.briefing).toHaveBeenCalledWith(employee, '2026-09-17');
  });

  it('rejects a malformed date', async () => {
    const { controller, assistant } = makeController();
    await expect(controller.briefing({ user: employee }, { date: '09/17/2026' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(assistant.briefing).not.toHaveBeenCalled();
  });

  it('lets a super-admin open Coach on their own hours', async () => {
    const { controller, assistant } = makeController();
    await controller.briefing({ user: superAdmin }, {});
    expect(assistant.briefing).toHaveBeenCalledWith(superAdmin, undefined);
  });

  it('chats against the caller only', async () => {
    const { controller, assistant } = makeController();
    await controller.chat(
      { user: employee },
      { date: '2026-09-17', message: 'How much effective time?', history: [] },
    );
    expect(assistant.chat).toHaveBeenCalledWith(employee, {
      date: '2026-09-17',
      message: 'How much effective time?',
      history: [],
    });
  });
});
