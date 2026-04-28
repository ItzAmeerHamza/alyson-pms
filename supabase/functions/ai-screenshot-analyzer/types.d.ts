// Type definitions for Supabase Edge Functions with Deno
/// <reference lib="webworker" />

// Deno standard library modules
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response> | Response): void;
}

declare module 'https://deno.land/std@*/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response> | Response): void;
}

// Supabase client modules
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
}

declare module 'https://esm.sh/@supabase/supabase-js@*' {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
}

// Deno globals
declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
    function toObject(): Record<string, string>;
  }
}

// Web APIs
declare function btoa(str: string): string;
declare function atob(str: string): string;

declare const crypto: {
  subtle: {
    digest(algorithm: string, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer>;
  };
};

declare const TextEncoder: {
  new(): {
    encode(input: string): Uint8Array;
  };
};

declare const console: {
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
}; 