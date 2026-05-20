
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ADMIN_ONLY: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_VISION_STATS_RPC_ENABLED?: string;
  readonly VITE_URL_LOGS_ENABLED?: string;
  readonly VITE_APP_SETTINGS_DB_ENABLED?: string;
  readonly MODE: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
