import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Worker } from 'tesseract.js';

export const MAX_OCR_CHARS = 6000;
export const TESSERACT_TIMEOUT_MS = 25_000;

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
  '/usr/bin/tesseract',
  '/opt/homebrew/bin/tesseract',
  '/usr/local/bin/tesseract',
];

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

  const cli = resolveTesseractBin();
  if (cli) {
    return ocrWithCli(buffer, cli);
  }
  return ocrWithTesseractJs(buffer);
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
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      jsWorker = worker;
      return worker;
    })().catch((err) => {
      jsWorkerReady = null;
      throw err;
    });
  }
  return jsWorkerReady;
}

async function ocrWithTesseractJs(buffer: Buffer): Promise<string> {
  const worker = await getJsWorker();
  const { data } = await worker.recognize(buffer);
  return normalizeOcrText(data.text || '');
}
