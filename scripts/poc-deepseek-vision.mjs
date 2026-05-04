/**
 * POC: send local PNG to DeepSeek chat with image block (expected: 400 text-only) and
 * optional DEEPSEEK_VL_API_URL if you have a working vision HTTP endpoint.
 * Run: node --env-file=.env scripts/poc-deepseek-vision.mjs [path-to-image.png]
 *
 * Finding (2026-05): api.deepseek.com chat rejects image_url; hosts like
 * api.deepseek.international from unofficial guides do not resolve (NXDOMAIN).
 *
 * For structured screenshot_intelligence via DeepSeek text-only, use:
 *   scripts/deepseek-screenshot-intelligence-text.mjs
 */
import fs from 'fs';

const imgPath =
  process.argv[2] ||
  '/Users/revcloudmac/.cursor/projects/Users-revcloudmac-Desktop-alyson-time-doctor/assets/image-6a2d7349-49ef-4be4-b5d3-b9f563ea6526.png';

const key = process.env.DEEPSEEK_API_KEY;
if (!key) {
  console.error('Set DEEPSEEK_API_KEY (e.g. node --env-file=.env ...)');
  process.exit(1);
}

const buf = fs.readFileSync(imgPath);
const b64 = buf.toString('base64');
const dataUrl = `data:image/png;base64,${b64}`;
const prompt =
  'Describe this screenshot in 4–6 sentences: what site/app, main activity, and any visible text or UI that matters.';

async function tryDeepSeekChat(model) {
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 600,
      temperature: 0.2,
    }),
  });
  const text = await r.text();
  return { label: `api.deepseek.com chat (${model})`, status: r.status, body: text };
}

async function tryDeepSeekVl(url) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: dataUrl,
      prompt,
      output_format: 'text',
    }),
  });
  const text = await r.text();
  return { label: url, status: r.status, body: text };
}

console.log('Image:', imgPath, `(${buf.length} bytes)\n`);

for (const model of ['deepseek-v4-flash', 'deepseek-chat']) {
  const out = await tryDeepSeekChat(model);
  console.log('---', out.label, '---');
  console.log('HTTP', out.status);
  try {
    const j = JSON.parse(out.body);
    const content = j.choices?.[0]?.message?.content;
    if (content) console.log('Content:\n', content);
    else console.log(JSON.stringify(j, null, 2).slice(0, 2500));
  } catch {
    console.log(out.body.slice(0, 1500));
  }
  console.log('');
}

const vlUrl = process.env.DEEPSEEK_VL_API_URL;
if (vlUrl) {
  const out = await tryDeepSeekVl(vlUrl.replace(/\/$/, ''));
  console.log('---', out.label, '---');
  console.log('HTTP', out.status);
  try {
    console.log(JSON.stringify(JSON.parse(out.body), null, 2).slice(0, 2500));
  } catch {
    console.log(out.body.slice(0, 1500));
  }
  console.log('');
} else {
  console.log('--- DEEPSEEK_VL_API_URL not set — skipping VL POST ---\n');
}
