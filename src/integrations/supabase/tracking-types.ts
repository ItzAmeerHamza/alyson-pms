/**
 * Time Tracking Types
 * 
 * @deprecated This file is deprecated. Use '@/types/database-generated' instead.
 * Types are now auto-generated from the live Supabase database.
 * Run: npm run db:types to regenerate
 */

import { Database } from '@/types/database-generated';

// Re-export Database as TrackingDatabase for backward compatibility
export type TrackingDatabase = Database;

// Export specific table types for convenience
export type TimeLog = Database['public']['Tables']['time_logs']['Row'];
export type TimeLogInsert = Database['public']['Tables']['time_logs']['Insert'];
export type TimeLogUpdate = Database['public']['Tables']['time_logs']['Update'];

export type IdleLog = Database['public']['Tables']['idle_logs']['Row'];
export type IdleLogInsert = Database['public']['Tables']['idle_logs']['Insert'];
export type IdleLogUpdate = Database['public']['Tables']['idle_logs']['Update'];
