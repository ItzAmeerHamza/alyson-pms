import { describe, expect, it, vi } from 'vitest';
import { AssistantService } from '../../src/pulse/assistant.service';
import {
  OFF_TOPIC_COACH_REPLY,
  buildPlanningFacts,
  isPureMetricLookup,
  replyHasInventedHours,
} from '../../src/pulse/assistant-briefing';
import { NOW, PERSONAS, QUESTIONS, nowFor } from './personas';

function service(configured: boolean, summary = 'MODEL REPLY') {
  const llm = {
    isConfigured: () => configured,
    chatJson: vi.fn(async () => ({ parsed: { greeting: 'ok', summary } })),
  };
  const svc = new AssistantService({} as never, {} as never, {} as never, llm as never);
  let current = NOW;
  (svc as unknown as { now: () => number }).now = () => current;
  const ask = async (persona: keyof typeof PERSONAS, question: string) => {
    current = nowFor(persona);
    return (await (svc as any).composeCopy(PERSONAS[persona], { mode: 'chat', question, history: [] })).summary as string;
  };
  return { ask, llm };
}

describe('Coach eval routing (offline)', () => {
  const onTopic = QUESTIONS.filter((x) => x.intent !== 'off_topic');

  it('sends every advice, planning, insight and wellbeing question to the model', async () => {
    const { ask } = service(true);
    for (const { q, intent } of onTopic) {
      if (intent === 'status' && isPureMetricLookup(q)) continue;
      expect(await ask('idle_heavy', q), q).toBe('MODEL REPLY');
    }
  });

  it('never refuses an on-topic question when the model is down', async () => {
    const { ask } = service(false);
    for (const persona of Object.keys(PERSONAS) as Array<keyof typeof PERSONAS>) {
      for (const { q } of onTopic) {
        const reply = await ask(persona, q);
        expect(reply, `${persona}: ${q}`).not.toBe(OFF_TOPIC_COACH_REPLY);
        expect(replyHasInventedHours(PERSONAS[persona], reply, buildPlanningFacts(PERSONAS[persona], nowFor(persona))), `${persona}: ${q}`).toBe(false);
      }
    }
  });

  it('answers "what is still needed" from computed planning numbers', () => {
    const facts = buildPlanningFacts(PERSONAS.idle_heavy, NOW).join('\n');
    expect(facts).toContain('Still needed for the 7 hours effective daily target: 3 hours 24 min.');
    expect(facts).toMatch(/This week: 3 hours 36 min effective of the 35 hours target; 31 hours 24 min still needed/);
    expect(facts).toMatch(/This month \(October 2026\): .* 93 hours still needed.* about 9 hours 18 min effective per weekday .* stretch/);
    expect(facts).toContain('Most distracting app in samples: YouTube.');
    expect(facts).toContain('Breaks between sessions (timer stopped): 11:00 AM–11:45 AM (45 min); 1:30 PM–2:00 PM (30 min).');
    expect(facts).toMatch(/around \d{1,2}:\d{2}\s?PM if you keep working from now \(3:30\s?PM\)/);
  });

  it('treats advice ranges as advice but still rejects invented record totals', () => {
    const stats = PERSONAS.idle_heavy;
    const planning = buildPlanningFacts(stats, NOW);
    expect(replyHasInventedHours(stats, 'Block 2–3 hours for deep work and take 5-10 min breaks.', planning)).toBe(false);
    expect(replyHasInventedHours(stats, 'Try a 2-hour focus block, then a 25 min break.', planning)).toBe(false);
    expect(replyHasInventedHours(stats, 'You still need 3 hours 24 min today.', planning)).toBe(false);
    expect(replyHasInventedHours(stats, '- 3:30 PM–5:00 PM: Deep work (1 hour 30 min)', planning)).toBe(false);
    expect(replyHasInventedHours(stats, '- 9:00–11:30 AM: Focus block (2 hours 30 min)', planning)).toBe(false);
    expect(replyHasInventedHours(stats, '- 3:30 PM–5:00 PM: Deep work (4 hours 10 min)', planning)).toBe(true);
    expect(replyHasInventedHours(stats, '- 3:30 PM–5:30 PM: Focus\n- 5:30 PM–6:00 PM: Break\n- 6:00 PM–7:00 PM: Focus\nThis gives you 3 hours of work.', planning)).toBe(false);
    expect(replyHasInventedHours(stats, 'You worked 12 hours effective today.', planning)).toBe(true);
    expect(replyHasInventedHours(stats, 'You need about 11.5 hours per day.', planning)).toBe(true);
  });

  it('retries once when the model invents hours, then keeps the corrected reply', async () => {
    const llm = {
      isConfigured: () => true,
      chatJson: vi
        .fn()
        .mockResolvedValueOnce({ parsed: { summary: 'You worked 12 hours effective today.' } })
        .mockResolvedValueOnce({ parsed: { summary: 'You have 3 hours 36 min effective so far.' } }),
    };
    const svc = new AssistantService({} as never, {} as never, {} as never, llm as never);
    (svc as unknown as { now: () => number }).now = () => NOW;
    const copy = await (svc as any).composeCopy(PERSONAS.idle_heavy, { mode: 'chat', question: 'How did I do today?' });
    expect(llm.chatJson).toHaveBeenCalledTimes(2);
    expect(String(llm.chatJson.mock.calls[1][0].userContent)).toContain('(12 hours)');
    expect(copy.summary).toBe('You have 3 hours 36 min effective so far.');
  });

  it('shows list items the model put in suggestions after a "here are 3 tips:" lead-in', async () => {
    const llm = {
      isConfigured: () => true,
      chatJson: vi.fn(async () => ({
        parsed: { summary: 'Here are 3 tips to reduce it:', suggestions: ['Stop the timer when you step away', 'Close YouTube', 'Use 25 min focus blocks'] },
      })),
    };
    const svc = new AssistantService({} as never, {} as never, {} as never, llm as never);
    (svc as unknown as { now: () => number }).now = () => NOW;
    const copy = await (svc as any).composeCopy(PERSONAS.idle_heavy, { mode: 'chat', question: 'Give me 3 tips to reduce my idle time' });
    expect(copy.summary).toBe('Here are 3 tips to reduce it:\n- Stop the timer when you step away\n- Close YouTube\n- Use 25 min focus blocks');
  });

  it('treats a weekend as a weekend: no daily target, no late-night push', () => {
    const facts = buildPlanningFacts(PERSONAS.weekend_clean, nowFor('weekend_clean')).join('\n');
    expect(facts).toContain('Sun, Oct 18 is a weekend day: no daily target applies');
    expect(facts).not.toContain('Still needed for the');
    expect(facts).not.toContain("At today's effective share");
    expect(facts).toMatch(/This week: 42 hours 18 min effective — the 35 hours target is already met/);
    expect(PERSONAS.weekend_clean.coaching.tips.join(' ')).not.toMatch(/target/);
    expect(facts).toContain('A full workday that reaches the 7 hours target: 9:00 AM–5:00 PM');
  });

  it('flags a finish time late in the evening', () => {
    const lateNow = Date.parse('2026-10-19T19:30:00Z'); // 3:30 PM New York; 5 hours 40 min more ends after 9 PM
    const facts = buildPlanningFacts(PERSONAS.idle_heavy, lateNow).join('\n');
    expect(facts).toMatch(/around 9:10\s?PM .*That is late in the evening\./);
  });

  it('refuses arithmetic without calling the model', async () => {
    const { ask, llm } = service(true);
    expect(await ask('on_track', '2+2')).toBe(OFF_TOPIC_COACH_REPLY);
    expect(llm.chatJson).not.toHaveBeenCalled();
  });
});
