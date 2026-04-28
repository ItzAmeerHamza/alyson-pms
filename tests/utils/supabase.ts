import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/integrations/supabase/types';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  jwt: string;
  organizationId: string;
}

export interface TestProject {
  id: string;
  name: string;
  description?: string;
}

export interface TestData {
  user: TestUser;
  projects: TestProject[];
  organizationId: string;
}

export class SupabaseTestClient {
  private client: SupabaseClient<Database>;
  private serviceClient: SupabaseClient<Database>;
  public testRunId: string;

  constructor(testRunId: string) {
    this.testRunId = testRunId;
    
    const supabaseUrl = process.env.TEST_SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration for tests');
    }

    // Client for user operations (with RLS)
    this.client = createClient<Database>(supabaseUrl, supabaseAnonKey);
    
    // Service client for admin operations (bypasses RLS) - fallback to anon key if no service key
    this.serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
  }

  async createTestUser(): Promise<TestUser> {
    const email = `test-${this.testRunId}@example.com`;
    const password = 'TestPassword123!';

    // Create user via service client
    const { data: authData, error: authError } = await this.serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create test user: ${authError?.message}`);
    }

    // Create user profile (no organizations table exists) - use upsert to handle duplicates
    const { error: profileError } = await this.serviceClient
      .from('users')
      .upsert({
        id: authData.user.id,
        email,
        full_name: `Test User ${this.testRunId}`,
        is_active: true,
        role: 'admin', // Use admin role for testing to access projects
      });

    if (profileError) {
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    // Get JWT token
    const { data: sessionData, error: sessionError } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData.session) {
      throw new Error(`Failed to sign in test user: ${sessionError?.message}`);
    }

    return {
      id: authData.user.id,
      email,
      password,
      jwt: sessionData.session.access_token,
      organizationId: `test-org-${this.testRunId}`, // Mock organization ID
    };
  }

  async createTestProjects(userId: string, organizationId: string): Promise<TestProject[]> {
    const projects = [
      {
        name: `Alpha Project ${this.testRunId}`,
        description: 'Test project Alpha for E2E testing',
      },
      {
        name: `Beta Project ${this.testRunId}`,
        description: 'Test project Beta for E2E testing',
      },
    ];

    const { data, error } = await this.serviceClient
      .from('projects')
      .insert(projects)
      .select();

    if (error) {
      throw new Error(`Failed to create test projects: ${error.message}`);
    }

    return data.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
    }));
  }

  // Helper methods for test assertions
  async getTimeLogs(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('time_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getScreenshots(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('screenshots')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getAppLogs(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('app_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getUrlLogs(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('url_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getIdleLogs(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('idle_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getActivities(userId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // Storage operations
  async listScreenshotFiles(prefix?: string): Promise<any[]> {
    const path = prefix ? `test/${this.testRunId}/${prefix}` : `test/${this.testRunId}`;
    
    const { data, error } = await this.client.storage
      .from('screenshots')
      .list(path);

    if (error) throw error;
    return data || [];
  }

  async getScreenshotUrl(path: string): Promise<string> {
    const { data } = await this.client.storage
      .from('screenshots')
      .getPublicUrl(path);

    return data.publicUrl;
  }

  // Insert test fixtures
  async insertTestSession(userId: string, projectId: string, overrides: any = {}): Promise<any> {
    const session = {
      id: `session-${this.testRunId}-${Date.now()}`,
      user_id: userId,
      project_id: projectId,
      status: 'active',
      start_time: new Date().toISOString(),
      ...overrides,
    };

    const { data, error } = await this.serviceClient
      .from('time_logs')
      .insert(session)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async insertTestScreenshot(userId: string, timeLogId: string, overrides: any = {}): Promise<any> {
    const screenshot = {
      id: `screenshot-${this.testRunId}-${Date.now()}`,
      user_id: userId,
      time_log_id: timeLogId,
      file_path: `test/${this.testRunId}/screenshot-${Date.now()}.png`,
      activity_percent: 75,
      timestamp: new Date().toISOString(),
      ...overrides,
    };

    const { data, error } = await this.serviceClient
      .from('screenshots')
      .insert(screenshot)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async insertTestAppLog(userId: string, timeLogId: string, overrides: any = {}): Promise<any> {
    const appLog = {
      id: `app-log-${this.testRunId}-${Date.now()}`,
      user_id: userId,
      time_log_id: timeLogId,
      app_name: 'Test App',
      window_title: 'Test Window',
      timestamp: new Date().toISOString(),
      ...overrides,
    };

    const { data, error } = await this.serviceClient
      .from('app_logs')
      .insert(appLog)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Authentication helpers
  async setUserAuth(jwt: string): Promise<void> {
    if (!jwt) {
      // When using existing desktop agent user (no JWT), skip auth; tests relying on RLS will use service client paths
      return;
    }
    await this.client.auth.setSession({
      access_token: jwt,
      refresh_token: 'fake-refresh-token',
    });
  }

  createUserClient(userId: string): SupabaseClient<Database> {
    // For now, return the main client - this should be authenticated with setUserAuth
    // In a real implementation, you might create a separate client instance
    return this.client;
  }

  async createOtherOrgUser(): Promise<TestUser> {
    const email = `other-org-${this.testRunId}@example.com`;
    const password = 'TestPassword123!';

    const { data: authData, error: authError } = await this.serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new Error(`Failed to create other org user: ${authError?.message}`);
    }

    const { error: profileError } = await this.serviceClient
      .from('users')
      .upsert({
        id: authData.user.id,
        email,
        full_name: `Other User ${this.testRunId}`,
        is_active: true,
        role: 'employee',
      });

    if (profileError) {
      throw new Error(`Failed to create other user profile: ${profileError.message}`);
    }

    const { data: sessionData, error: sessionError } = await this.client.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData.session) {
      throw new Error(`Failed to sign in other user: ${sessionError?.message}`);
    }

    return {
      id: authData.user.id,
      email,
      password,
      jwt: sessionData.session.access_token,
      organizationId: `other-org-${this.testRunId}`, // Mock organization ID
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    try {
      // Delete all test data by test_run_id or user_id patterns
      const testUserId = `test-${this.testRunId}@example.com`;
      const otherUserId = `other-org-${this.testRunId}@example.com`;
      
      // Get user IDs first - these may not exist if cleanup runs after failed setup
      let testUserData = null;
      let otherUserData = null;
      
      try {
        const testUserResponse = await this.serviceClient.auth.admin.listUsers();
        testUserData = testUserResponse.data?.users?.find(u => u.email === testUserId);
        
        const otherUserResponse = await this.serviceClient.auth.admin.listUsers();
        otherUserData = otherUserResponse.data?.users?.find(u => u.email === otherUserId);
      } catch (error) {
        console.warn('Could not fetch users for cleanup:', error);
      }

      // Clean up storage
      const { data: files } = await this.serviceClient.storage
        .from('screenshots')
        .list(`test/${this.testRunId}`);

      if (files && files.length > 0) {
        const filePaths = files.map(f => `test/${this.testRunId}/${f.name}`);
        await this.serviceClient.storage
          .from('screenshots')
          .remove(filePaths);
      }

      // Clean up database records
      if (testUserData?.id) {
        // Delete in order to respect foreign key constraints
        await this.serviceClient.from('activities').delete().eq('user_id', testUserData.id);
        await this.serviceClient.from('url_logs').delete().eq('user_id', testUserData.id);
        await this.serviceClient.from('app_logs').delete().eq('user_id', testUserData.id);
        await this.serviceClient.from('idle_logs').delete().eq('user_id', testUserData.id);
        await this.serviceClient.from('screenshots').delete().eq('user_id', testUserData.id);
        await this.serviceClient.from('time_logs').delete().eq('user_id', testUserData.id);
        
        // Delete test projects
        await this.serviceClient.from('projects').delete().like('name', `%${this.testRunId}`);
      }

      if (otherUserData?.id) {
        await this.serviceClient.from('activities').delete().eq('user_id', otherUserData.id);
        await this.serviceClient.from('url_logs').delete().eq('user_id', otherUserData.id);
        await this.serviceClient.from('app_logs').delete().eq('user_id', otherUserData.id);
        await this.serviceClient.from('idle_logs').delete().eq('user_id', otherUserData.id);
        await this.serviceClient.from('screenshots').delete().eq('user_id', otherUserData.id);
        await this.serviceClient.from('time_logs').delete().eq('user_id', otherUserData.id);
      }

      // Delete auth users last
      if (testUserData?.id) {
        await this.serviceClient.auth.admin.deleteUser(testUserData.id);
      }
      if (otherUserData?.id) {
        await this.serviceClient.auth.admin.deleteUser(otherUserData.id);
      }

    } catch (error) {
      console.warn('Cleanup error (non-fatal):', error);
    }
  }
}

export function createTestSupabaseClient(testRunId: string): SupabaseTestClient {
  return new SupabaseTestClient(testRunId);
}
