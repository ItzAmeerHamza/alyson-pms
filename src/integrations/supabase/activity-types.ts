/**
 * Activity Monitoring Types
 * 
 * @deprecated This file is deprecated. Use '@/types/database-generated' instead.
 * Types are now auto-generated from the live Supabase database.
 * Run: npm run db:types to regenerate
 */

import { Database } from '@/types/database-generated';

// Re-export Database as ActivityDatabase for backward compatibility
export type ActivityDatabase = Database;

// Export specific table types for convenience
export type AppLog = Database['public']['Tables']['app_logs']['Row'];
export type AppLogInsert = Database['public']['Tables']['app_logs']['Insert'];
export type AppLogUpdate = Database['public']['Tables']['app_logs']['Update'];

export type Screenshot = Database['public']['Tables']['screenshots']['Row'];
export type ScreenshotInsert = Database['public']['Tables']['screenshots']['Insert'];
export type ScreenshotUpdate = Database['public']['Tables']['screenshots']['Update'];

// URL logs is a view in the database
export type UrlLog = Database['public']['Views']['url_logs']['Row'];
