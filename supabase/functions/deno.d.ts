// Deno global types for Supabase Edge Functions
declare global {
  namespace Deno {
    interface Env {
      get(key: string): string | undefined;
      toObject(): Record<string, string>;
    }
    
    const env: Env;
  }
}

// Deno standard library types - comprehensive coverage
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response> | Response): void;
  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
  }
}

declare module 'https://deno.land/std@*/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response> | Response): void;
  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
  }
}

// Supabase client types - comprehensive coverage
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
  export interface SupabaseClient {
    from(table: string): any;
    auth: any;
    storage: any;
    rpc(fn: string, params?: any): any;
  }
  export type { SupabaseClient };
}

declare module 'https://esm.sh/@supabase/supabase-js@*' {
  export function createClient(url: string, key: string, options?: any): any;
  export interface SupabaseClient {
    from(table: string): any;
    auth: any;
    storage: any;
    rpc(fn: string, params?: any): any;
  }
  export type { SupabaseClient };
}

// Web APIs available in Deno/Edge Functions
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer>;
    encrypt(algorithm: any, key: any, data: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer>;
    decrypt(algorithm: any, key: any, data: ArrayBuffer | ArrayBufferView): Promise<ArrayBuffer>;
  };
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

// Global functions for Deno environment
declare function btoa(data: string): string;
declare function atob(data: string): string;
declare function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;

// Additional Deno globals
declare const TextEncoder: {
  new(): {
    encode(input: string): Uint8Array;
  };
};

declare const TextDecoder: {
  new(label?: string, options?: TextDecoderOptions): {
    decode(input?: ArrayBuffer | ArrayBufferView, options?: TextDecodeOptions): string;
  };
};

// Console for logging
declare const console: {
  log(...data: any[]): void;
  error(...data: any[]): void;
  warn(...data: any[]): void;
  info(...data: any[]): void;
  debug(...data: any[]): void;
};

// Additional interfaces for completeness
interface TextDecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

interface TextDecodeOptions {
  stream?: boolean;
}

export {}; 