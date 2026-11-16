/**
 * Live Coach eval against the configured OpenRouter model.
 *   cd backend && npm run eval:coach
 * Needs OPENROUTER_API_KEY in backend/.env. Writes test/coach-eval/results-live.json.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { AssistantService } from '../../src/pulse/assistant.service';
import { OFF_TOPIC_COACH_REPLY } from '../../src/pulse/assistant-briefing';
import { DeepseekVisionService } from '../../src/screenshot-ai/deepseek-vision.service';
import { PERSONAS, QUESTIONS, grade, nowFor } from './personas';

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (queue.length) await fn(queue.shift()!); }));
}

async function main() {
  const base = new DeepseekVisionService(new ConfigService());
  if (!base.isConfigured()) throw new Error('OPENROUTER_API_KEY is not set in backend/.env');
  const out: any[] = [];
  const jobs = Object.entries(PERSONAS).flatMap(([persona, stats]) => QUESTIONS.map((x) => ({ persona, stats, ...x })));
  await pool(jobs, 6, async ({ persona, stats, q, intent }) => {
    let raw: any = null;
    const llm = { isConfigured: () => true, chatJson: async (p: any) => { const r = await base.chatJson(p); raw = r.parsed; return r; } };
    const svc = new AssistantService({} as never, {} as never, {} as never, llm as never);
    (svc as any).now = () => nowFor(persona);
    const t0 = Date.now();
    const copy = await (svc as any).composeCopy(stats, { mode: 'chat', question: q, history: [] });
    const reply: string = copy.summary;
    const route = !raw
      ? reply === OFF_TOPIC_COACH_REPLY ? 'refused' : 'template'
      : raw.off_topic === true ? 'model:off_topic'
      : reply.startsWith(String(raw.summary || '').trim().slice(0, 40)) ? 'model'
      : 'model→rejected→fallback';
    out.push({ persona, q, intent, route, ms: Date.now() - t0, reply, raw: raw?.summary, ...grade(persona, intent, route, reply, q) });
  });
  writeFileSync(join(__dirname, 'results-live.json'), JSON.stringify(out, null, 2));
  for (const { q } of QUESTIONS) {
    const rows = out.filter((r) => r.q === q);
    const ok = rows.filter((r) => r.ok).length;
    console.log(`${ok === rows.length ? 'PASS' : 'FAIL'} ${ok}/${rows.length}  ${q}  [${[...new Set(rows.map((r) => r.route))].join(', ')}]`);
    for (const r of rows) for (const issue of r.issues) console.log(`      - ${r.persona}: ${issue}`);
  }
  const pass = out.filter((r) => r.ok).length;
  console.log(`\nScore: ${pass}/${out.length} (${Math.round((pass / out.length) * 100)}%)`);
  console.log(`Median latency: ${out.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(out.length / 2)]} ms`);
  console.log(`Replies: ${join(__dirname, 'results-live.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
