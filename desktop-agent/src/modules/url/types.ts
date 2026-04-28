/**
 * URL Detection Types
 * Unified types for URL capture across all platforms
 */

export type UrlSource = 'chrome' | 'edge' | 'brave' | 'firefox' | 'safari' | 'unknown';

export type UrlConfidence = 'high' | 'medium' | 'low' | 'none' | 'unknown';

export type UrlEventDiagnostics = {
  placeholder?: boolean;
  [key: string]: unknown;
};

export type UrlEvent = {
  ts: number;
  app: string;        // OS app name or bundle id
  source: UrlSource;  // inferred browser
  url: string | null; // null if unknown/new tab/internal
  title: string | null;
  windowId: string | number | null;
  pid: number | null;
  confidence?: UrlConfidence;
  diagnostics?: UrlEventDiagnostics;
};

export type StopFn = () => void;

export interface IUrlCapture {
  start(onEvent: (e: UrlEvent) => void): StopFn;
}

export type UrlResolver = IUrlCapture;

