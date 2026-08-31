import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Worker } from 'tesseract.js';

export const MAX_OCR_CHARS = 6000;
export const TESSERACT_TIMEOUT_MS = 25_000;
/** Dual-monitor JPEGs are huge; OCR only needs readable UI text. */
export const OCR_MAX_WIDTH = 1600;

export function imageExtension(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  return 'jpg';
}

/** Collapse blank lines and case-insensitive duplicates. */
export function normalizeOcrText(raw: string, maxChars = MAX_OCR_CHARS): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.join('\n').slice(0, maxChars);
}

const TESSERACT_CANDIDATES = [
  process.env.TESSERACT_BIN,
  '/opt/bin/tesseract',
  '/usr/bin/tesseract',
  '/opt/homebrew/bin/tesseract',
  '/usr/local/bin/tesseract',
];

/** Downscale + grayscale so Lambda WASM OCR is seconds, not ~15s on full shots. */
export async function prepareOcrBuffer(buffer: Buffer): Promise<Buffer> {
  if (buffer.length === 0) return buffer;
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buffer)
      .rotate()
      .resize({ width: OCR_MAX_WIDTH, withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

export function resolveTesseractBin(): string | null {
  for (const candidate of TESSERACT_CANDIDATES) {
    const bin = String(candidate || '').trim();
    if (bin && existsSync(bin)) return bin;
  }
  return null;
}

export async function ocrWithTesseract(buffer: Buffer): Promise<string> {
  if (buffer.length === 0) {
    return '';
  }

  const prepared = await prepareOcrBuffer(buffer);
  const cli = resolveTesseractBin();
  if (cli) {
    return ocrWithCli(prepared, cli);
  }
  return ocrWithTesseractJs(prepared);
}

async function ocrWithCli(buffer: Buffer, bin: string): Promise<string> {
  const ext = imageExtension(buffer);
  const inputPath = join(tmpdir(), `pulse-ocr-${randomBytes(8).toString('hex')}.${ext}`);
  await writeFile(inputPath, buffer);

  try {
    const stdout = await runTesseractCli(bin, inputPath);
    return normalizeOcrText(stdout);
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
}

function runTesseractCli(bin: string, inputPath: string): Promise<string> {
  const args = [inputPath, 'stdout', '-l', 'eng', '--psm', '6', '--oem', '1'];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`tesseract timed out after ${TESSERACT_TIMEOUT_MS}ms`));
    }, TESSERACT_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`tesseract exited ${code}: ${stderr.trim().slice(0, 200)}`));
    });
  });
}

let jsWorker: Worker | null = null;
let jsWorkerReady: Promise<Worker> | null = null;

async function getJsWorker(): Promise<Worker> {
  if (jsWorker) return jsWorker;
  if (!jsWorkerReady) {
    jsWorkerReady = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      jsWorker = worker;
      return worker;
    })().catch((err) => {
      jsWorkerReady = null;
      throw err;
    });
  }
  return jsWorkerReady;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`tesseract timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function resetJsWorker(): Promise<void> {
  const worker = jsWorker;
  jsWorker = null;
  jsWorkerReady = null;
  if (worker) {
    await worker.terminate().catch(() => undefined);
  }
}

async function ocrWithTesseractJs(buffer: Buffer): Promise<string> {
  const worker = await getJsWorker();
  try {
    const { data } = await withTimeout(worker.recognize(buffer), TESSERACT_TIMEOUT_MS);
    return normalizeOcrText(data.text || '');
  } catch (err) {
    await resetJsWorker();
    throw err;
  }
}
