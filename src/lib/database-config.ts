// Database Configuration
// This file allows switching between local and remote Supabase databases

export interface DatabaseConfig {
  isRemote: boolean;
  hasBrowserColumn: boolean;
  hasCreatedAtColumn: boolean;
  tableName: string;
}

// Local database configuration (missing some columns)
export const localDatabaseConfig: DatabaseConfig = {
  isRemote: false,
  hasBrowserColumn: false,
  hasCreatedAtColumn: false,
  tableName: 'url_logs'
};

// Remote database configuration (has all columns)
export const remoteDatabaseConfig: DatabaseConfig = {
  isRemote: true,
  hasBrowserColumn: true,
  hasCreatedAtColumn: true,
  tableName: 'url_logs'
};

// Auto-detect configuration based on environment
export function getDatabaseConfig(): DatabaseConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  
  // Check if we're using the remote database
  if (supabaseUrl && supabaseUrl.includes('fkpiqcxkmrtaetvfgcli.supabase.co')) {
    return remoteDatabaseConfig;
  }
  
  // For development, if no environment is set, default to remote for now
  // since we have MCP access to it
  if (!supabaseUrl) {
    console.log('🔍 No VITE_SUPABASE_URL found, using remote database via MCP');
    return remoteDatabaseConfig;
  }
  
  // Default to local configuration
  return localDatabaseConfig;
}

// Get the appropriate table name and columns based on configuration
export function getUrlLogsQuery(config: DatabaseConfig) {
  if (config.hasBrowserColumn && config.hasCreatedAtColumn) {
    return {
      table: config.tableName,
      columns: 'id, url, title, domain, browser, timestamp, created_at, user_id'
    };
  } else if (config.hasBrowserColumn) {
    return {
      table: config.tableName,
      columns: 'id, url, title, domain, browser, timestamp, user_id'
    };
  } else {
    return {
      table: config.tableName,
      columns: 'id, url, title, domain, timestamp, user_id'
    };
  }
}

// Check if we have MCP access to the remote database
export function hasMCPAccess(): boolean {
  try {
    // This will be true if we're running in an environment with MCP access
    return typeof window !== 'undefined' && 'mcp_supabase' in window;
  } catch {
    return false;
  }
}

// Get the best available database configuration
export function getBestDatabaseConfig(): DatabaseConfig {
  // If we have MCP access, prefer remote database
  if (hasMCPAccess()) {
    console.log('🔍 MCP access detected, using remote database configuration');
    return remoteDatabaseConfig;
  }
  
  // Otherwise use environment-based detection
  return getDatabaseConfig();
}
