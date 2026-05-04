/// <reference lib="webworker" />
declare module 'npm:@supabase/supabase-js@2' {
  export function createClient(supabaseUrl: string, supabaseKey: string, options?: any): any;
}
declare module 'jsr:@supabase/functions-js/edge-runtime.d.ts';
declare namespace Deno {
  namespace env {
    function get(key: string): string | undefined;
  }
  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}
