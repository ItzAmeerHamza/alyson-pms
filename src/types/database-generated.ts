export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      activity_stats: {
        Row: {
          active_time_seconds: number | null
          apps_count: number | null
          created_at: string | null
          id: string
          keystrokes: number | null
          mouse_clicks: number | null
          mouse_movements: number | null
          organization_id: string | null
          period_end: string
          period_start: string
          productivity_score: number | null
          screenshot_count: number | null
          session_duration_seconds: number | null
          time_log_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_time_seconds?: number | null
          apps_count?: number | null
          created_at?: string | null
          id?: string
          keystrokes?: number | null
          mouse_clicks?: number | null
          mouse_movements?: number | null
          organization_id?: string | null
          period_end: string
          period_start: string
          productivity_score?: number | null
          screenshot_count?: number | null
          session_duration_seconds?: number | null
          time_log_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_time_seconds?: number | null
          apps_count?: number | null
          created_at?: string | null
          id?: string
          keystrokes?: number | null
          mouse_clicks?: number | null
          mouse_movements?: number | null
          organization_id?: string | null
          period_end?: string
          period_start?: string
          productivity_score?: number | null
          screenshot_count?: number | null
          session_duration_seconds?: number | null
          time_log_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_stats_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          ai_confidence: number | null
          ai_reasoning: string | null
          alert_type: string
          category: string | null
          created_at: string | null
          id: string
          is_false_positive: boolean | null
          message: string
          metadata: Json | null
          organization_id: string | null
          screenshot_id: string | null
          severity: string
          title: string
          updated_at: string | null
          user_id: string
          vision_analysis: Json | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          ai_confidence?: number | null
          ai_reasoning?: string | null
          alert_type: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_false_positive?: boolean | null
          message: string
          metadata?: Json | null
          organization_id?: string | null
          screenshot_id?: string | null
          severity: string
          title: string
          updated_at?: string | null
          user_id: string
          vision_analysis?: Json | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          ai_confidence?: number | null
          ai_reasoning?: string | null
          alert_type?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_false_positive?: boolean | null
          message?: string
          metadata?: Json | null
          organization_id?: string | null
          screenshot_id?: string | null
          severity?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          vision_analysis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_screenshot_id_fkey"
            columns: ["screenshot_id"]
            isOneToOne: false
            referencedRelation: "screenshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          target_user_id: string | null
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          target_user_id?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          target_user_id?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_analysis_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          job_data: Json
          priority: number | null
          result: Json | null
          retry_count: number | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data: Json
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          job_data?: Json
          priority?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      ai_employee_insights: {
        Row: {
          ai_model: string
          analysis_type: string
          analysis_version: string
          confidence_score: number | null
          created_at: string | null
          id: string
          insights: Json
          organization_id: string | null
          period_end: string
          period_start: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_model?: string
          analysis_type: string
          analysis_version?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insights: Json
          organization_id?: string | null
          period_end: string
          period_start: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_model?: string
          analysis_type?: string
          analysis_version?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insights?: Json
          organization_id?: string | null
          period_end?: string
          period_start?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_employee_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employee_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_employee_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_patterns: {
        Row: {
          avg_activity_percent: number | null
          avg_screenshots_per_day: number | null
          common_apps: Json | null
          common_sites: Json | null
          created_at: string | null
          data_points_analyzed: number | null
          id: string
          last_pattern_update: string | null
          organization_id: string | null
          pattern_confidence: number | null
          productivity_by_hour: Json | null
          typical_break_duration_minutes: number | null
          typical_breaks_per_day: number | null
          typical_work_hours: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_activity_percent?: number | null
          avg_screenshots_per_day?: number | null
          common_apps?: Json | null
          common_sites?: Json | null
          created_at?: string | null
          data_points_analyzed?: number | null
          id?: string
          last_pattern_update?: string | null
          organization_id?: string | null
          pattern_confidence?: number | null
          productivity_by_hour?: Json | null
          typical_break_duration_minutes?: number | null
          typical_breaks_per_day?: number | null
          typical_work_hours?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_activity_percent?: number | null
          avg_screenshots_per_day?: number | null
          common_apps?: Json | null
          common_sites?: Json | null
          created_at?: string | null
          data_points_analyzed?: number | null
          id?: string
          last_pattern_update?: string | null
          organization_id?: string | null
          pattern_confidence?: number | null
          productivity_by_hour?: Json | null
          typical_break_duration_minutes?: number | null
          typical_breaks_per_day?: number | null
          typical_work_hours?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_user_patterns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_user_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_user_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_worker_status: {
        Row: {
          created_at: string | null
          error_count: number | null
          error_details: Json | null
          id: string
          last_run: string | null
          processed_count: number | null
          status: string
          updated_at: string | null
          worker_type: string
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          error_details?: Json | null
          id?: string
          last_run?: string | null
          processed_count?: number | null
          status: string
          updated_at?: string | null
          worker_type: string
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          error_details?: Json | null
          id?: string
          last_run?: string | null
          processed_count?: number | null
          status?: string
          updated_at?: string | null
          worker_type?: string
        }
        Relationships: []
      }
      app_logs: {
        Row: {
          agent_version: string | null
          app_name: string
          app_path: string | null
          capture_method: string | null
          category: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          organization_id: string | null
          project_id: string | null
          started_at: string
          time_log_id: string | null
          timestamp: string | null
          user_id: string
          window_title: string | null
        }
        Insert: {
          agent_version?: string | null
          app_name: string
          app_path?: string | null
          capture_method?: string | null
          category?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          started_at?: string
          time_log_id?: string | null
          timestamp?: string | null
          user_id: string
          window_title?: string | null
        }
        Update: {
          agent_version?: string | null
          app_name?: string
          app_path?: string | null
          capture_method?: string | null
          category?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          started_at?: string
          time_log_id?: string | null
          timestamp?: string | null
          user_id?: string
          window_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      app_url_activity: {
        Row: {
          browser: string | null
          confidence: string | null
          created_at: string
          device_id: string | null
          domain: string | null
          ended_at: string | null
          id: string
          organization_id: string | null
          privacy_flags: Json | null
          site_url: string | null
          started_at: string
          time_log_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          confidence?: string | null
          created_at?: string
          device_id?: string | null
          domain?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          privacy_flags?: Json | null
          site_url?: string | null
          started_at?: string
          time_log_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          confidence?: string | null
          created_at?: string
          device_id?: string | null
          domain?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          privacy_flags?: Json | null
          site_url?: string | null
          started_at?: string
          time_log_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_triggers: {
        Row: {
          created_at: string | null
          id: string
          processed: boolean | null
          processed_at: string | null
          trigger_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          trigger_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          processed_at?: string | null
          trigger_type?: string
        }
        Relationships: []
      }
      daily_insights_reports: {
        Row: {
          analysis_errors: Json | null
          attention_required_count: number | null
          created_at: string | null
          high_performers_count: number | null
          id: string
          management_priorities: string[] | null
          overall_productivity_average: number | null
          recommended_actions: string[] | null
          report_data: Json | null
          report_date: string
          security_alerts_count: number | null
          total_employees_analyzed: number | null
        }
        Insert: {
          analysis_errors?: Json | null
          attention_required_count?: number | null
          created_at?: string | null
          high_performers_count?: number | null
          id: string
          management_priorities?: string[] | null
          overall_productivity_average?: number | null
          recommended_actions?: string[] | null
          report_data?: Json | null
          report_date: string
          security_alerts_count?: number | null
          total_employees_analyzed?: number | null
        }
        Update: {
          analysis_errors?: Json | null
          attention_required_count?: number | null
          created_at?: string | null
          high_performers_count?: number | null
          id?: string
          management_priorities?: string[] | null
          overall_productivity_average?: number | null
          recommended_actions?: string[] | null
          report_data?: Json | null
          report_date?: string
          security_alerts_count?: number | null
          total_employees_analyzed?: number | null
        }
        Relationships: []
      }
      email_secrets: {
        Row: {
          created_at: string | null
          id: string
          key_name: string
          key_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key_name: string
          key_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key_name?: string
          key_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_comprehensive_analysis: {
        Row: {
          analysis_data: Json
          analysis_date: string
          confidence_score: number | null
          created_at: string | null
          flags_count: number | null
          id: string
          organization_id: string | null
          productivity_score: number | null
          security_risk_level: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis_data: Json
          analysis_date: string
          confidence_score?: number | null
          created_at?: string | null
          flags_count?: number | null
          id: string
          organization_id?: string | null
          productivity_score?: number | null
          security_risk_level?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis_data?: Json
          analysis_date?: string
          confidence_score?: number | null
          created_at?: string | null
          flags_count?: number | null
          id?: string
          organization_id?: string | null
          productivity_score?: number | null
          security_risk_level?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_comprehensive_analysis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_comprehensive_analysis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_comprehensive_analysis_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_daily_activities: {
        Row: {
          activity_date: string
          behavioral_notes: string | null
          created_at: string | null
          focus_time_blocks: string[] | null
          id: string
          main_applications: string[] | null
          organization_id: string | null
          productivity_score: number | null
          user_id: string
          websites_visited: string[] | null
          work_description: string | null
        }
        Insert: {
          activity_date: string
          behavioral_notes?: string | null
          created_at?: string | null
          focus_time_blocks?: string[] | null
          id?: string
          main_applications?: string[] | null
          organization_id?: string | null
          productivity_score?: number | null
          user_id: string
          websites_visited?: string[] | null
          work_description?: string | null
        }
        Update: {
          activity_date?: string
          behavioral_notes?: string | null
          created_at?: string | null
          focus_time_blocks?: string[] | null
          id?: string
          main_applications?: string[] | null
          organization_id?: string | null
          productivity_score?: number | null
          user_id?: string
          websites_visited?: string[] | null
          work_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_daily_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_deductions: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string
          deduction_type: string
          id: string
          is_active: boolean | null
          month_year: string
          organization_id: string | null
          reason: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by: string
          deduction_type: string
          id?: string
          is_active?: boolean | null
          month_year: string
          organization_id?: string | null
          reason: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string
          deduction_type?: string
          id?: string
          is_active?: boolean | null
          month_year?: string
          organization_id?: string | null
          reason?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_deductions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_insights: {
        Row: {
          activity_percentage: number | null
          ai_insights: Json | null
          analysis_version: string | null
          behavioral_patterns: Json | null
          computed_at: string | null
          distraction_indicators: Json | null
          id: string
          last_active: string | null
          organization_id: string | null
          period_end: string
          period_start: string
          period_type: string
          productivity_indicators: Json | null
          productivity_score: number | null
          risk_level: string | null
          screenshots_analyzed: number | null
          total_hours: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_percentage?: number | null
          ai_insights?: Json | null
          analysis_version?: string | null
          behavioral_patterns?: Json | null
          computed_at?: string | null
          distraction_indicators?: Json | null
          id?: string
          last_active?: string | null
          organization_id?: string | null
          period_end: string
          period_start: string
          period_type: string
          productivity_indicators?: Json | null
          productivity_score?: number | null
          risk_level?: string | null
          screenshots_analyzed?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_percentage?: number | null
          ai_insights?: Json | null
          analysis_version?: string | null
          behavioral_patterns?: Json | null
          computed_at?: string | null
          distraction_indicators?: Json | null
          id?: string
          last_active?: string | null
          organization_id?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          productivity_indicators?: Json | null
          productivity_score?: number | null
          risk_level?: string | null
          screenshots_analyzed?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_management_insights: {
        Row: {
          coaching_opportunities: string[] | null
          created_at: string | null
          id: string
          insight_date: string
          organization_id: string | null
          performance_feedback: string | null
          skill_development_suggestions: string[] | null
          team_collaboration_insights: string | null
          user_id: string
          workload_adjustments: string[] | null
        }
        Insert: {
          coaching_opportunities?: string[] | null
          created_at?: string | null
          id?: string
          insight_date: string
          organization_id?: string | null
          performance_feedback?: string | null
          skill_development_suggestions?: string[] | null
          team_collaboration_insights?: string | null
          user_id: string
          workload_adjustments?: string[] | null
        }
        Update: {
          coaching_opportunities?: string[] | null
          created_at?: string | null
          id?: string
          insight_date?: string
          organization_id?: string | null
          performance_feedback?: string | null
          skill_development_suggestions?: string[] | null
          team_collaboration_insights?: string | null
          user_id?: string
          workload_adjustments?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_management_insights_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_management_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_management_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll: {
        Row: {
          base_salary: number | null
          created_at: string | null
          deductions: number | null
          final_salary: number | null
          id: string
          is_paid: boolean | null
          month_year: string
          notes: string | null
          organization_id: string | null
          overtime_hours: number | null
          overtime_pay: number | null
          paid_at: string | null
          regular_hours: number | null
          total_hours_worked: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          base_salary?: number | null
          created_at?: string | null
          deductions?: number | null
          final_salary?: number | null
          id?: string
          is_paid?: boolean | null
          month_year: string
          notes?: string | null
          organization_id?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          paid_at?: string | null
          regular_hours?: number | null
          total_hours_worked?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          base_salary?: number | null
          created_at?: string | null
          deductions?: number | null
          final_salary?: number | null
          id?: string
          is_paid?: boolean | null
          month_year?: string
          notes?: string | null
          organization_id?: string | null
          overtime_hours?: number | null
          overtime_pay?: number | null
          paid_at?: string | null
          regular_hours?: number | null
          total_hours_worked?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_project_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string
          id: string
          organization_id: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_project_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_settings: {
        Row: {
          created_at: string | null
          effective_from: string | null
          hourly_rate: number | null
          id: string
          minimum_hours_monthly: number | null
          monthly_salary: number | null
          notes: string | null
          organization_id: string | null
          overtime_rate: number | null
          salary_type: string
          screenshot_frequency_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string | null
          hourly_rate?: number | null
          id?: string
          minimum_hours_monthly?: number | null
          monthly_salary?: number | null
          notes?: string | null
          organization_id?: string | null
          overtime_rate?: number | null
          salary_type?: string
          screenshot_frequency_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string | null
          hourly_rate?: number | null
          id?: string
          minimum_hours_monthly?: number | null
          monthly_salary?: number | null
          notes?: string | null
          organization_id?: string | null
          overtime_rate?: number | null
          salary_type?: string
          screenshot_frequency_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_suspicious_activity: {
        Row: {
          analysis_date: string
          created_at: string | null
          entertainment_apps: number | null
          flags: string[] | null
          id: string
          idle_time_hours: number | null
          low_focus_periods: number | null
          news_consumption: number | null
          organization_id: string | null
          productivity_metrics: Json | null
          raw_data: Json | null
          risk_score: number | null
          screenshot_analysis: Json | null
          social_media_usage: number | null
          unproductive_websites: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis_date?: string
          created_at?: string | null
          entertainment_apps?: number | null
          flags?: string[] | null
          id?: string
          idle_time_hours?: number | null
          low_focus_periods?: number | null
          news_consumption?: number | null
          organization_id?: string | null
          productivity_metrics?: Json | null
          raw_data?: Json | null
          risk_score?: number | null
          screenshot_analysis?: Json | null
          social_media_usage?: number | null
          unproductive_websites?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis_date?: string
          created_at?: string | null
          entertainment_apps?: number | null
          flags?: string[] | null
          id?: string
          idle_time_hours?: number | null
          low_focus_periods?: number | null
          news_consumption?: number | null
          organization_id?: string | null
          productivity_metrics?: Json | null
          raw_data?: Json | null
          risk_score?: number | null
          screenshot_analysis?: Json | null
          social_media_usage?: number | null
          unproductive_websites?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_suspicious_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_suspicious_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_suspicious_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_warnings: {
        Row: {
          actual_value: number | null
          created_at: string | null
          gap_percentage: number | null
          id: string
          is_reviewed: boolean | null
          message: string
          month_year: string
          organization_id: string | null
          required_value: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          updated_at: string | null
          user_id: string
          warning_type: string
        }
        Insert: {
          actual_value?: number | null
          created_at?: string | null
          gap_percentage?: number | null
          id?: string
          is_reviewed?: boolean | null
          message: string
          month_year: string
          organization_id?: string | null
          required_value?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          updated_at?: string | null
          user_id: string
          warning_type: string
        }
        Update: {
          actual_value?: number | null
          created_at?: string | null
          gap_percentage?: number | null
          id?: string
          is_reviewed?: boolean | null
          message?: string
          month_year?: string
          organization_id?: string | null
          required_value?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          updated_at?: string | null
          user_id?: string
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_warnings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_warnings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_warnings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_working_standards: {
        Row: {
          created_at: string | null
          employment_type: string
          id: string
          is_active: boolean | null
          minimum_hours_daily: number | null
          organization_id: string | null
          overtime_threshold: number | null
          required_days_monthly: number | null
          required_hours_monthly: number | null
          updated_at: string | null
          user_id: string
          warning_threshold_percentage: number | null
        }
        Insert: {
          created_at?: string | null
          employment_type: string
          id?: string
          is_active?: boolean | null
          minimum_hours_daily?: number | null
          organization_id?: string | null
          overtime_threshold?: number | null
          required_days_monthly?: number | null
          required_hours_monthly?: number | null
          updated_at?: string | null
          user_id: string
          warning_threshold_percentage?: number | null
        }
        Update: {
          created_at?: string | null
          employment_type?: string
          id?: string
          is_active?: boolean | null
          minimum_hours_daily?: number | null
          organization_id?: string | null
          overtime_threshold?: number | null
          required_days_monthly?: number | null
          required_hours_monthly?: number | null
          updated_at?: string | null
          user_id?: string
          warning_threshold_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_working_standards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_standards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_standards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          activity_context: Json | null
          alert_type: string
          behavior_analysis: Json | null
          confidence: number | null
          created_at: string | null
          detected_at: string
          detection_details: Json | null
          id: string
          is_false_positive: boolean | null
          is_reviewed: boolean | null
          organization_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_score: number
          screenshot_context: Json | null
          severity: string
          suspicious_patterns: Json | null
          system_context: Json | null
          time_log_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_context?: Json | null
          alert_type: string
          behavior_analysis?: Json | null
          confidence?: number | null
          created_at?: string | null
          detected_at: string
          detection_details?: Json | null
          id?: string
          is_false_positive?: boolean | null
          is_reviewed?: boolean | null
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number
          screenshot_context?: Json | null
          severity: string
          suspicious_patterns?: Json | null
          system_context?: Json | null
          time_log_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_context?: Json | null
          alert_type?: string
          behavior_analysis?: Json | null
          confidence?: number | null
          created_at?: string | null
          detected_at?: string
          detection_details?: Json | null
          id?: string
          is_false_positive?: boolean | null
          is_reviewed?: boolean | null
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_score?: number
          screenshot_context?: Json | null
          severity?: string
          suspicious_patterns?: Json | null
          system_context?: Json | null
          time_log_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      idle_logs: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          duration_seconds: number | null
          id: string
          idle_end: string | null
          idle_start: string
          organization_id: string | null
          project_id: string | null
          time_log_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          duration_seconds?: number | null
          id?: string
          idle_end?: string | null
          idle_start?: string
          organization_id?: string | null
          project_id?: string | null
          time_log_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          duration_seconds?: number | null
          id?: string
          idle_end?: string | null
          idle_start?: string
          organization_id?: string | null
          project_id?: string | null
          time_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_idle_logs_project_id"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_idle_logs_time_log_id"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_idle_logs_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_idle_logs_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idle_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          notification_type: string
          organization_id: string | null
          payload: Json
          recipient_id: string | null
          recipient_type: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          notification_type: string
          organization_id?: string | null
          payload: Json
          recipient_id?: string | null
          recipient_type: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          notification_type?: string
          organization_id?: string | null
          payload?: Json
          recipient_id?: string | null
          recipient_type?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          delivered_via: string[] | null
          id: string
          organization_id: string | null
          payload: Json
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_via?: string[] | null
          id?: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_via?: string[] | null
          id?: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_configurations: {
        Row: {
          alert_settings: Json | null
          created_at: string | null
          description: string | null
          filters: Json | null
          id: string
          include_alerts: boolean | null
          include_employee_details: boolean | null
          include_projects: boolean | null
          include_summary: boolean | null
          is_active: boolean | null
          name: string
          organization_id: string | null
          report_type_id: string | null
          schedule_cron: string | null
          schedule_description: string | null
          subject_template: string
          template_type: string | null
          updated_at: string | null
        }
        Insert: {
          alert_settings?: Json | null
          created_at?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          include_alerts?: boolean | null
          include_employee_details?: boolean | null
          include_projects?: boolean | null
          include_summary?: boolean | null
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          report_type_id?: string | null
          schedule_cron?: string | null
          schedule_description?: string | null
          subject_template: string
          template_type?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_settings?: Json | null
          created_at?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          include_alerts?: boolean | null
          include_employee_details?: boolean | null
          include_projects?: boolean | null
          include_summary?: boolean | null
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          report_type_id?: string | null
          schedule_cron?: string | null
          schedule_description?: string | null
          subject_template?: string
          template_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_configurations_report_type_id_fkey"
            columns: ["report_type_id"]
            isOneToOne: false
            referencedRelation: "report_types"
            referencedColumns: ["id"]
          },
        ]
      }
      report_history: {
        Row: {
          email_service_id: string | null
          error_message: string | null
          id: string
          organization_id: string | null
          recipient_count: number | null
          report_config_id: string | null
          report_data: Json | null
          sent_at: string | null
          status: string
        }
        Insert: {
          email_service_id?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          recipient_count?: number | null
          report_config_id?: string | null
          report_data?: Json | null
          sent_at?: string | null
          status: string
        }
        Update: {
          email_service_id?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          recipient_count?: number | null
          report_config_id?: string | null
          report_data?: Json | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_history_report_config_id_fkey"
            columns: ["report_config_id"]
            isOneToOne: false
            referencedRelation: "report_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_recipients: {
        Row: {
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          organization_id: string | null
          report_config_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          report_config_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          report_config_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_recipients_report_config_id_fkey"
            columns: ["report_config_id"]
            isOneToOne: false
            referencedRelation: "report_configurations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      report_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          template_type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          template_type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          template_type?: string
        }
        Relationships: []
      }
      screenshot_categorization: {
        Row: {
          assigned_by: string | null
          category: string
          confidence_score: number | null
          id: string
          notes: string | null
          screenshot_id: string
          timestamp: string
        }
        Insert: {
          assigned_by?: string | null
          category: string
          confidence_score?: number | null
          id?: string
          notes?: string | null
          screenshot_id: string
          timestamp?: string
        }
        Update: {
          assigned_by?: string | null
          category?: string
          confidence_score?: number | null
          id?: string
          notes?: string | null
          screenshot_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshot_categorization_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_categorization_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_categorization_screenshot_id_fkey"
            columns: ["screenshot_id"]
            isOneToOne: false
            referencedRelation: "screenshots"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots: {
        Row: {
          active_window_title: string | null
          activity_percent: number | null
          activity_type: string | null
          agent_version: string | null
          ai_analysis_status: string | null
          ai_analyzed_at: string | null
          ai_flags: Json | null
          ai_metadata: Json | null
          ai_model_used: string | null
          alert_id: string | null
          app_name: string | null
          captured_at: string
          category: string | null
          classification: string | null
          confidence_score: number | null
          consecutive_duplicate_count: number | null
          distraction_score: number | null
          duplicate_confidence: string | null
          duplicate_group_hash: string | null
          duplicate_hash: string | null
          duplicate_matched_id: string | null
          duplicate_reason: string | null
          file_path: string | null
          focus_percent: number | null
          has_context: boolean | null
          id: string
          idle_inferred: boolean | null
          image_sha256: string | null
          image_url: string
          is_blurred: boolean | null
          is_duplicate: boolean | null
          is_work_related: boolean | null
          keystrokes: number | null
          mouse_clicks: number | null
          mouse_movements: number | null
          needs_vision_validation: boolean | null
          organization_id: string | null
          perceptual_hash: string | null
          project_id: string | null
          suspicion_score: number | null
          task_id: string | null
          time_log_id: string | null
          url: string | null
          user_id: string | null
          vision_analysis: Json | null
          vision_category: string | null
          vision_confidence: number | null
          vision_content: string | null
          vision_detected_content: string | null
          vision_privacy_concerns: string[] | null
          vision_validated_at: string | null
          window_title: string | null
        }
        Insert: {
          active_window_title?: string | null
          activity_percent?: number | null
          activity_type?: string | null
          agent_version?: string | null
          ai_analysis_status?: string | null
          ai_analyzed_at?: string | null
          ai_flags?: Json | null
          ai_metadata?: Json | null
          ai_model_used?: string | null
          alert_id?: string | null
          app_name?: string | null
          captured_at?: string
          category?: string | null
          classification?: string | null
          confidence_score?: number | null
          consecutive_duplicate_count?: number | null
          distraction_score?: number | null
          duplicate_confidence?: string | null
          duplicate_group_hash?: string | null
          duplicate_hash?: string | null
          duplicate_matched_id?: string | null
          duplicate_reason?: string | null
          file_path?: string | null
          focus_percent?: number | null
          has_context?: boolean | null
          id?: string
          idle_inferred?: boolean | null
          image_sha256?: string | null
          image_url: string
          is_blurred?: boolean | null
          is_duplicate?: boolean | null
          is_work_related?: boolean | null
          keystrokes?: number | null
          mouse_clicks?: number | null
          mouse_movements?: number | null
          needs_vision_validation?: boolean | null
          organization_id?: string | null
          perceptual_hash?: string | null
          project_id?: string | null
          suspicion_score?: number | null
          task_id?: string | null
          time_log_id?: string | null
          url?: string | null
          user_id?: string | null
          vision_analysis?: Json | null
          vision_category?: string | null
          vision_confidence?: number | null
          vision_content?: string | null
          vision_detected_content?: string | null
          vision_privacy_concerns?: string[] | null
          vision_validated_at?: string | null
          window_title?: string | null
        }
        Update: {
          active_window_title?: string | null
          activity_percent?: number | null
          activity_type?: string | null
          agent_version?: string | null
          ai_analysis_status?: string | null
          ai_analyzed_at?: string | null
          ai_flags?: Json | null
          ai_metadata?: Json | null
          ai_model_used?: string | null
          alert_id?: string | null
          app_name?: string | null
          captured_at?: string
          category?: string | null
          classification?: string | null
          confidence_score?: number | null
          consecutive_duplicate_count?: number | null
          distraction_score?: number | null
          duplicate_confidence?: string | null
          duplicate_group_hash?: string | null
          duplicate_hash?: string | null
          duplicate_matched_id?: string | null
          duplicate_reason?: string | null
          file_path?: string | null
          focus_percent?: number | null
          has_context?: boolean | null
          id?: string
          idle_inferred?: boolean | null
          image_sha256?: string | null
          image_url?: string
          is_blurred?: boolean | null
          is_duplicate?: boolean | null
          is_work_related?: boolean | null
          keystrokes?: number | null
          mouse_clicks?: number | null
          mouse_movements?: number | null
          needs_vision_validation?: boolean | null
          organization_id?: string | null
          perceptual_hash?: string | null
          project_id?: string | null
          suspicion_score?: number | null
          task_id?: string | null
          time_log_id?: string | null
          url?: string | null
          user_id?: string | null
          vision_analysis?: Json | null
          vision_category?: string | null
          vision_confidence?: number | null
          vision_content?: string | null
          vision_detected_content?: string | null
          vision_privacy_concerns?: string[] | null
          vision_validated_at?: string | null
          window_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_screenshots_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_screenshots_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "admin_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_duplicate_matched_id_fkey"
            columns: ["duplicate_matched_id"]
            isOneToOne: false
            referencedRelation: "screenshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshot_deletions: {
        Row: {
          id: string
          screenshot_id: string
          user_id: string | null
          time_log_id: string | null
          organization_id: string | null
          deleted_by: string
          deleted_at: string
          deducted_seconds: number
          screenshot_captured_at: string
          image_url: string | null
          deletion_source: string
          created_at: string
        }
        Insert: {
          id?: string
          screenshot_id: string
          user_id?: string | null
          time_log_id?: string | null
          organization_id?: string | null
          deleted_by: string
          deleted_at?: string
          deducted_seconds?: number
          screenshot_captured_at: string
          image_url?: string | null
          deletion_source: string
          created_at?: string
        }
        Update: {
          id?: string
          screenshot_id?: string
          user_id?: string | null
          time_log_id?: string | null
          organization_id?: string | null
          deleted_by?: string
          deleted_at?: string
          deducted_seconds?: number
          screenshot_captured_at?: string
          image_url?: string | null
          deletion_source?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshot_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_deletions_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          blur_screenshots: boolean
          created_at: string
          id: string
          idle_threshold_seconds: number
          notification_rules: Json
          screenshot_interval_seconds: number
          updated_at: string
        }
        Insert: {
          blur_screenshots?: boolean
          created_at?: string
          id?: string
          idle_threshold_seconds?: number
          notification_rules?: Json
          screenshot_interval_seconds?: number
          updated_at?: string
        }
        Update: {
          blur_screenshots?: boolean
          created_at?: string
          id?: string
          idle_threshold_seconds?: number
          notification_rules?: Json
          screenshot_interval_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      suspicious_activity: {
        Row: {
          activity_type: string
          category: string | null
          created_at: string | null
          details: string | null
          id: string
          organization_id: string | null
          reviewed: boolean | null
          risk_score: number | null
          timestamp: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          category?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          organization_id?: string | null
          reviewed?: boolean | null
          risk_score?: number | null
          timestamp?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          category?: string | null
          created_at?: string | null
          details?: string | null
          id?: string
          organization_id?: string | null
          reviewed?: boolean | null
          risk_score?: number | null
          timestamp?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspicious_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspicious_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspicious_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      suspicious_activity_detection: {
        Row: {
          activity_score: number | null
          created_at: string | null
          detection_date: string
          entertainment_time_minutes: number | null
          flags: Json | null
          focus_score: number | null
          id: string
          idle_time_minutes: number | null
          news_time_minutes: number | null
          notes: string | null
          organization_id: string | null
          productivity_score: number | null
          risk_level: string | null
          social_media_time_minutes: number | null
          total_work_time_minutes: number | null
          user_id: string
        }
        Insert: {
          activity_score?: number | null
          created_at?: string | null
          detection_date: string
          entertainment_time_minutes?: number | null
          flags?: Json | null
          focus_score?: number | null
          id?: string
          idle_time_minutes?: number | null
          news_time_minutes?: number | null
          notes?: string | null
          organization_id?: string | null
          productivity_score?: number | null
          risk_level?: string | null
          social_media_time_minutes?: number | null
          total_work_time_minutes?: number | null
          user_id: string
        }
        Update: {
          activity_score?: number | null
          created_at?: string | null
          detection_date?: string
          entertainment_time_minutes?: number | null
          flags?: Json | null
          focus_score?: number | null
          id?: string
          idle_time_minutes?: number | null
          news_time_minutes?: number | null
          notes?: string | null
          organization_id?: string | null
          productivity_score?: number | null
          risk_level?: string | null
          social_media_time_minutes?: number | null
          total_work_time_minutes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspicious_activity_detection_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspicious_activity_detection_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspicious_activity_detection_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      system_checks: {
        Row: {
          check_type: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          status: string | null
          test_data: Json | null
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          check_type: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string | null
          test_data?: Json | null
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          check_type?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string | null
          test_data?: Json | null
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          id: string
          log_type: string
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_type: string
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          log_type?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tasks_projects"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tasks_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tasks_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_logs: {
        Row: {
          created_at: string | null
          deducted_seconds: number
          description: string | null
          device_id: string | null
          end_time: string | null
          id: string
          idle_seconds: number | null
          is_idle: boolean
          is_manual: boolean | null
          organization_id: string | null
          project_id: string | null
          start_time: string
          status: string | null
          task_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deducted_seconds?: number
          description?: string | null
          device_id?: string | null
          end_time?: string | null
          id?: string
          idle_seconds?: number | null
          is_idle?: boolean
          is_manual?: boolean | null
          organization_id?: string | null
          project_id?: string | null
          start_time?: string
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deducted_seconds?: number
          description?: string | null
          device_id?: string | null
          end_time?: string | null
          id?: string
          idle_seconds?: number | null
          is_idle?: boolean
          is_manual?: boolean | null
          organization_id?: string | null
          project_id?: string | null
          start_time?: string
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_time_logs_project"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_time_logs_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_time_logs_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_overlay_settings: {
        Row: {
          created_at: string
          custom_text: string | null
          id: string
          organization_id: string | null
          overlay_enabled: boolean
          position: string | null
          transparency_level: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_text?: string | null
          id?: string
          organization_id?: string | null
          overlay_enabled?: boolean
          position?: string | null
          transparency_level?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_text?: string | null
          id?: string
          organization_id?: string | null
          overlay_enabled?: boolean
          position?: string | null
          transparency_level?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_overlay_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_overlay_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_overlay_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_status_logs: {
        Row: {
          id: string
          metadata: Json | null
          organization_id: string | null
          session_id: string | null
          status: string
          timestamp: string
          user_id: string
        }
        Insert: {
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          session_id?: string | null
          status: string
          timestamp?: string
          user_id: string
        }
        Update: {
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          session_id?: string | null
          status?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_status_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_status_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_status_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      unusual_activity: {
        Row: {
          confidence: number | null
          detected_at: string
          duration_hm: string | null
          id: string
          notes: string | null
          organization_id: string | null
          rule_triggered: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          detected_at?: string
          duration_hm?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          rule_triggered: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          detected_at?: string
          duration_hm?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          rule_triggered?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unusual_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      url_logs_old: {
        Row: {
          browser: string | null
          category: string | null
          domain: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          organization_id: string | null
          project_id: string | null
          site_url: string
          started_at: string
          time_log_id: string | null
          timestamp: string | null
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          category?: string | null
          domain?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          site_url: string
          started_at?: string
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          category?: string | null
          domain?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          organization_id?: string | null
          project_id?: string | null
          site_url?: string
          started_at?: string
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "url_logs_old_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_logs_time_log_id_fkey"
            columns: ["time_log_id"]
            isOneToOne: false
            referencedRelation: "time_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "url_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invites: {
        Row: {
          created_at: string | null
          email: string | null
          expires_at: string
          id: string
          invite_token: string
          invited_by: string | null
          organization_id: string | null
          role: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          expires_at: string
          id?: string
          invite_token: string
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by?: string | null
          organization_id?: string | null
          role?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          custom_screenshot_interval_seconds: number | null
          email: string
          full_name: string
          id: string
          idle_timeout_minutes: number | null
          is_active: boolean | null
          is_org_admin: boolean | null
          is_super_admin: boolean | null
          last_activity: string | null
          minimum_hours_monthly: number | null
          offline_tracking_enabled: boolean | null
          organization_id: string | null
          pause_allowed: boolean | null
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          role: string
          salary_amount: number | null
          salary_type: string | null
          screenshot_frequency_seconds: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          custom_screenshot_interval_seconds?: number | null
          email: string
          full_name: string
          id: string
          idle_timeout_minutes?: number | null
          is_active?: boolean | null
          is_org_admin?: boolean | null
          is_super_admin?: boolean | null
          last_activity?: string | null
          minimum_hours_monthly?: number | null
          offline_tracking_enabled?: boolean | null
          organization_id?: string | null
          pause_allowed?: boolean | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          role?: string
          salary_amount?: number | null
          salary_type?: string | null
          screenshot_frequency_seconds?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          custom_screenshot_interval_seconds?: number | null
          email?: string
          full_name?: string
          id?: string
          idle_timeout_minutes?: number | null
          is_active?: boolean | null
          is_org_admin?: boolean | null
          is_super_admin?: boolean | null
          last_activity?: string | null
          minimum_hours_monthly?: number | null
          offline_tracking_enabled?: boolean | null
          organization_id?: string | null
          pause_allowed?: boolean | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          role?: string
          salary_amount?: number | null
          salary_type?: string | null
          screenshot_frequency_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_analysis_metrics: {
        Row: {
          api_calls_made: number | null
          api_errors: string[] | null
          api_rate_limit_remaining: number | null
          api_rate_limit_reset_at: string | null
          created_at: string | null
          duplicates_confirmed: number | null
          duplicates_rejected: number | null
          error_message: string | null
          execution_duration_ms: number | null
          false_positives_caught: number | null
          id: string
          metadata: Json | null
          privacy_alerts_created: number | null
          screenshots_failed: number | null
          screenshots_processed: number | null
          status: string | null
          total_screenshots_flagged: number | null
          validator_run_id: string
          vision_validation_rate: number | null
        }
        Insert: {
          api_calls_made?: number | null
          api_errors?: string[] | null
          api_rate_limit_remaining?: number | null
          api_rate_limit_reset_at?: string | null
          created_at?: string | null
          duplicates_confirmed?: number | null
          duplicates_rejected?: number | null
          error_message?: string | null
          execution_duration_ms?: number | null
          false_positives_caught?: number | null
          id?: string
          metadata?: Json | null
          privacy_alerts_created?: number | null
          screenshots_failed?: number | null
          screenshots_processed?: number | null
          status?: string | null
          total_screenshots_flagged?: number | null
          validator_run_id: string
          vision_validation_rate?: number | null
        }
        Update: {
          api_calls_made?: number | null
          api_errors?: string[] | null
          api_rate_limit_remaining?: number | null
          api_rate_limit_reset_at?: string | null
          created_at?: string | null
          duplicates_confirmed?: number | null
          duplicates_rejected?: number | null
          error_message?: string | null
          execution_duration_ms?: number | null
          false_positives_caught?: number | null
          id?: string
          metadata?: Json | null
          privacy_alerts_created?: number | null
          screenshots_failed?: number | null
          screenshots_processed?: number | null
          status?: string | null
          total_screenshots_flagged?: number | null
          validator_run_id?: string
          vision_validation_rate?: number | null
        }
        Relationships: []
      }
      vision_api_calls_log: {
        Row: {
          created_at: string | null
          duplicate_confirmed: boolean | null
          error_message: string | null
          id: string
          privacy_concern_detected: boolean | null
          rate_limit_remaining: number | null
          rate_limit_reset_at: string | null
          request_duration_ms: number | null
          response_metadata: Json | null
          response_status: number | null
          screenshot_id: string | null
          success: boolean | null
          validator_run_id: string
          vision_category: string | null
          vision_confidence: number | null
        }
        Insert: {
          created_at?: string | null
          duplicate_confirmed?: boolean | null
          error_message?: string | null
          id?: string
          privacy_concern_detected?: boolean | null
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          request_duration_ms?: number | null
          response_metadata?: Json | null
          response_status?: number | null
          screenshot_id?: string | null
          success?: boolean | null
          validator_run_id: string
          vision_category?: string | null
          vision_confidence?: number | null
        }
        Update: {
          created_at?: string | null
          duplicate_confirmed?: boolean | null
          error_message?: string | null
          id?: string
          privacy_concern_detected?: boolean | null
          rate_limit_remaining?: number | null
          rate_limit_reset_at?: string | null
          request_duration_ms?: number | null
          response_metadata?: Json | null
          response_status?: number | null
          screenshot_id?: string | null
          success?: boolean | null
          validator_run_id?: string
          vision_category?: string | null
          vision_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vision_api_calls_log_screenshot_id_fkey"
            columns: ["screenshot_id"]
            isOneToOne: false
            referencedRelation: "screenshots"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_feature_flags: {
        Row: {
          alert_on_error_rate_percent: number | null
          alert_on_queue_backlog: number | null
          alert_on_rate_limit_percent: number | null
          backoff_multiplier: number | null
          created_at: string | null
          daily_api_call_limit: number | null
          hourly_api_call_limit: number | null
          id: string
          low_activity_threshold: number | null
          max_screenshots_per_run: number | null
          metrics_retention_days: number | null
          random_sample_percentage: number | null
          reason: string | null
          run_interval_minutes: number | null
          updated_at: string | null
          updated_by: string | null
          validate_duplicates: boolean | null
          validate_low_activity: boolean | null
          validate_suspicious: boolean | null
          vision_validation_enabled: boolean | null
        }
        Insert: {
          alert_on_error_rate_percent?: number | null
          alert_on_queue_backlog?: number | null
          alert_on_rate_limit_percent?: number | null
          backoff_multiplier?: number | null
          created_at?: string | null
          daily_api_call_limit?: number | null
          hourly_api_call_limit?: number | null
          id?: string
          low_activity_threshold?: number | null
          max_screenshots_per_run?: number | null
          metrics_retention_days?: number | null
          random_sample_percentage?: number | null
          reason?: string | null
          run_interval_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validate_duplicates?: boolean | null
          validate_low_activity?: boolean | null
          validate_suspicious?: boolean | null
          vision_validation_enabled?: boolean | null
        }
        Update: {
          alert_on_error_rate_percent?: number | null
          alert_on_queue_backlog?: number | null
          alert_on_rate_limit_percent?: number | null
          backoff_multiplier?: number | null
          created_at?: string | null
          daily_api_call_limit?: number | null
          hourly_api_call_limit?: number | null
          id?: string
          low_activity_threshold?: number | null
          max_screenshots_per_run?: number | null
          metrics_retention_days?: number | null
          random_sample_percentage?: number | null
          reason?: string | null
          run_interval_minutes?: number | null
          updated_at?: string | null
          updated_by?: string | null
          validate_duplicates?: boolean | null
          validate_low_activity?: boolean | null
          validate_suspicious?: boolean | null
          vision_validation_enabled?: boolean | null
        }
        Relationships: []
      }
      warning_logs: {
        Row: {
          action: string | null
          action_taken: string | null
          context: Json | null
          created_at: string | null
          dismissed_at: string | null
          id: string
          organization_id: string | null
          shown_at: string | null
          user_id: string
          user_response: string | null
          warning_id: string | null
          warning_message_id: string
          warning_type: string | null
        }
        Insert: {
          action?: string | null
          action_taken?: string | null
          context?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          organization_id?: string | null
          shown_at?: string | null
          user_id: string
          user_response?: string | null
          warning_id?: string | null
          warning_message_id: string
          warning_type?: string | null
        }
        Update: {
          action?: string | null
          action_taken?: string | null
          context?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          id?: string
          organization_id?: string | null
          shown_at?: string | null
          user_id?: string
          user_response?: string | null
          warning_id?: string | null
          warning_message_id?: string
          warning_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warning_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_logs_warning_message_id_fkey"
            columns: ["warning_message_id"]
            isOneToOne: false
            referencedRelation: "warning_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      warning_messages: {
        Row: {
          created_at: string | null
          created_by: string
          display_frequency: string | null
          id: string
          is_active: boolean | null
          message: string
          organization_id: string | null
          severity: string | null
          target_audience: string | null
          target_user_ids: string[] | null
          title: string
          trigger_conditions: Json | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          display_frequency?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          organization_id?: string | null
          severity?: string | null
          target_audience?: string | null
          target_user_ids?: string[] | null
          title: string
          trigger_conditions?: Json | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          display_frequency?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          organization_id?: string | null
          severity?: string | null
          target_audience?: string | null
          target_user_ids?: string[] | null
          title?: string
          trigger_conditions?: Json | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warning_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warning_templates: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_system: boolean | null
          message: string
          name: string
          severity: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          message: string
          name: string
          severity?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          message?: string
          name?: string
          severity?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          action: string
          created_at: string | null
          id: number
          record_id: string
          response_body: string | null
          status_code: number | null
          table_name: string
          webhook_url: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: number
          record_id: string
          response_body?: string | null
          status_code?: number | null
          table_name: string
          webhook_url: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: number
          record_id?: string
          response_body?: string | null
          status_code?: number | null
          table_name?: string
          webhook_url?: string
        }
        Relationships: []
      }
      worker_status: {
        Row: {
          created_at: string | null
          error_count: number | null
          error_rate: number | null
          id: string
          is_running: boolean | null
          last_error: string | null
          last_processed_count: number | null
          last_run: string | null
          next_run: string | null
          updated_at: string | null
          worker_type: string
        }
        Insert: {
          created_at?: string | null
          error_count?: number | null
          error_rate?: number | null
          id?: string
          is_running?: boolean | null
          last_error?: string | null
          last_processed_count?: number | null
          last_run?: string | null
          next_run?: string | null
          updated_at?: string | null
          worker_type: string
        }
        Update: {
          created_at?: string | null
          error_count?: number | null
          error_rate?: number | null
          id?: string
          is_running?: boolean | null
          last_error?: string | null
          last_processed_count?: number | null
          last_run?: string | null
          next_run?: string | null
          updated_at?: string | null
          worker_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_analysis_stats: {
        Row: {
          analyzed_count: number | null
          avg_confidence_score: number | null
          avg_distraction_score: number | null
          date: string | null
          entertainment_count: number | null
          failed_count: number | null
          gaming_count: number | null
          pending_count: number | null
          productive_count: number | null
          social_media_count: number | null
          total_screenshots: number | null
        }
        Relationships: []
      }
      alert_summary: {
        Row: {
          critical_count: number | null
          false_positive_count: number | null
          high_count: number | null
          latest_alert_at: string | null
          low_count: number | null
          medium_count: number | null
          unacknowledged_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      duplicate_screenshots_summary: {
        Row: {
          avg_activity_percent: number | null
          date: string | null
          duplicate_groups: number | null
          first_duplicate_at: string | null
          last_duplicate_at: string | null
          total_duplicates: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_screenshots_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_screenshots_users"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      url_logs: {
        Row: {
          browser: string | null
          created_at: string | null
          domain: string | null
          duration_seconds: number | null
          id: string | null
          site_url: string | null
          time_log_id: string | null
          timestamp: string | null
          title: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          domain?: string | null
          duration_seconds?: never
          id?: string | null
          site_url?: string | null
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          domain?: string | null
          duration_seconds?: never
          id?: string | null
          site_url?: string | null
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      url_logs_compat: {
        Row: {
          browser: string | null
          created_at: string | null
          domain: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string | null
          site_url: string | null
          started_at: string | null
          time_log_id: string | null
          timestamp: string | null
          title: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          domain?: string | null
          duration_seconds?: never
          ended_at?: string | null
          id?: string | null
          site_url?: string | null
          started_at?: string | null
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          domain?: string | null
          duration_seconds?: never
          ended_at?: string | null
          id?: string | null
          site_url?: string | null
          started_at?: string | null
          time_log_id?: string | null
          timestamp?: string | null
          title?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_agent_versions: {
        Row: {
          agent_version: string | null
          last_seen: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      v_dashboard: {
        Row: {
          email: string | null
          full_name: string | null
          hours_this_week: number | null
          hours_today: number | null
          id: string | null
          low_activity: boolean | null
          recent_screenshot_url: string | null
          weekly_activity_percent: number | null
        }
        Relationships: []
      }
      vision_daily_stats: {
        Row: {
          day: string | null
          false_positive_rate: number | null
          total_api_calls: number | null
          total_confirmed: number | null
          total_false_positives: number | null
          total_processed: number | null
          total_rejected: number | null
          total_runs: number | null
        }
        Relationships: []
      }
      vision_hourly_stats: {
        Row: {
          avg_duration_ms: number | null
          failed_runs: number | null
          hour: string | null
          rate_limited_runs: number | null
          total_api_calls: number | null
          total_confirmed: number | null
          total_failed: number | null
          total_false_positives: number | null
          total_privacy_alerts: number | null
          total_processed: number | null
          total_rejected: number | null
          total_runs: number | null
        }
        Relationships: []
      }
      warning_summary: {
        Row: {
          action: string | null
          action_display: string | null
          action_taken: string | null
          context: Json | null
          created_at: string | null
          dismissed_at: string | null
          id: string | null
          shown_at: string | null
          user_id: string | null
          user_response: string | null
          warning_id: string | null
          warning_message_id: string | null
          warning_type: string | null
        }
        Insert: {
          action?: string | null
          action_display?: never
          action_taken?: string | null
          context?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          id?: string | null
          shown_at?: string | null
          user_id?: string | null
          user_response?: string | null
          warning_id?: string | null
          warning_message_id?: string | null
          warning_type?: string | null
        }
        Update: {
          action?: string | null
          action_display?: never
          action_taken?: string | null
          context?: Json | null
          created_at?: string | null
          dismissed_at?: string | null
          id?: string | null
          shown_at?: string | null
          user_id?: string | null
          user_response?: string | null
          warning_id?: string | null
          warning_message_id?: string | null
          warning_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warning_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warning_logs_warning_message_id_fkey"
            columns: ["warning_message_id"]
            isOneToOne: false
            referencedRelation: "warning_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _extract_domain: { Args: { u: string }; Returns: string }
      bytea_to_text: { Args: { data: string }; Returns: string }
      cleanup_orphaned_url_slices: { Args: never; Returns: undefined }
      configure_service_role_key: {
        Args: { new_service_key: string }
        Returns: string
      }
      cron_run_ai_analysis: { Args: never; Returns: undefined }
      detect_duplicates_and_idle: {
        Args: never
        Returns: Record<string, unknown>
      }
      dismiss_warning: {
        Args: {
          p_action_taken?: string
          p_user_response?: string
          p_warning_log_id: string
        }
        Returns: boolean
      }
      find_duplicate_screenshots: {
        Args: {
          hours_back?: number
          input_duplicate_hash: string
          input_user_id: string
        }
        Returns: {
          captured_at: string
          screenshot_id: string
          similarity_score: number
        }[]
      }
      flag_for_vision_validation: {
        Args: { p_reason?: string; p_screenshot_ids: string[] }
        Returns: number
      }
      generate_edge_function_jwt: { Args: never; Returns: string }
      generate_employee_insights: {
        Args: { p_period_type?: string; p_user_id?: string }
        Returns: {
          elapsed_ms: number
          insights_created: number
          insights_updated: number
          users_processed: number
        }[]
      }
      get_active_warnings_for_user: {
        Args: { target_user_id: string }
        Returns: {
          display_frequency: string
          id: string
          message: string
          severity: string
          title: string
          valid_from: string
          valid_until: string
        }[]
      }
      get_organization_by_slug: {
        Args: { org_slug: string }
        Returns: {
          id: string
          is_active: boolean
          logo_url: string
          name: string
          slug: string
        }[]
      }
      get_privacy_risk_screenshots: {
        Args: {
          hours_back?: number
          input_user_id?: string
          risk_threshold?: number
        }
        Returns: {
          captured_at: string
          privacy_concerns: string[]
          privacy_risk_score: number
          screenshot_id: string
          user_id: string
        }[]
      }
      get_user_assigned_projects: { Args: never; Returns: string[] }
      get_user_organization_id: { Args: { user_id?: string }; Returns: string }
      get_user_role:
        | { Args: never; Returns: string }
        | { Args: { user_id: string }; Returns: string }
      get_vision_accuracy_stats: {
        Args: never
        Returns: {
          accuracy_improvement: number
          duplicates_confirmed: number
          duplicates_rejected: number
          false_positive_rate: number
          privacy_alerts: number
          sql_only_accuracy: number
          total_validated: number
          vision_accuracy: number
        }[]
      }
      get_vision_current_usage: {
        Args: never
        Returns: {
          calls_this_hour: number
          calls_today: number
          daily_limit: number
          daily_remaining: number
          daily_usage_percent: number
          hourly_limit: number
          hourly_remaining: number
          hourly_usage_percent: number
          is_rate_limited: boolean
          last_rate_limit_at: string
          queue_size: number
        }[]
      }
      get_vision_validation_queue: {
        Args: { p_limit?: number }
        Returns: {
          activity_percent: number
          app_name: string
          captured_at: string
          duplicate_confidence: string
          duplicate_reason: string
          id: string
          image_url: string
          is_duplicate: boolean
          user_id: string
          window_title: string
        }[]
      }
      hamming_distance_hex64: {
        Args: { a_hex: string; b_hex: string }
        Returns: number
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      infer_idle_screenshots: {
        Args: never
        Returns: {
          elapsed_ms: number
          idle_marked: number
        }[]
      }
      is_org_admin: { Args: { user_id?: string }; Returns: boolean }
      is_super_admin: { Args: { user_id?: string }; Returns: boolean }
      log_admin_change: {
        Args: {
          action_type: string
          admin_id: string
          new_data?: Json
          old_data?: Json
          target_id?: string
        }
        Returns: undefined
      }
      log_warning_shown: {
        Args: {
          p_action_taken?: string
          p_context?: Json
          p_user_id: string
          p_user_response?: string
          p_warning_message_id: string
        }
        Returns: string
      }
      mark_screenshot_for_reanalysis: {
        Args: { screenshot_id: string }
        Returns: undefined
      }
      pause_user: {
        Args: { admin_user_id: string; reason?: string; target_user_id: string }
        Returns: boolean
      }
      process_notification_queue: {
        Args: { batch_limit?: number }
        Returns: {
          failed_count: number
          processed_count: number
        }[]
      }
      process_pending_screenshots: {
        Args: { batch_limit?: number }
        Returns: {
          elapsed_ms: number
          failed_count: number
          processed_count: number
          skipped_count: number
        }[]
      }
      process_scheduled_reports: {
        Args: { report_type?: string }
        Returns: Json
      }
      process_scheduled_reports_direct: {
        Args: { report_type?: string }
        Returns: Json
      }
      prune_old_url_activity: {
        Args: { retention_days?: number }
        Returns: number
      }
      run_ai_employee_analysis: {
        Args: never
        Returns: {
          elapsed_ms: number
          users_queued: number
        }[]
      }
      run_insights_generator: { Args: never; Returns: undefined }
      run_insights_generator_per_org: { Args: never; Returns: undefined }
      run_notification_processor: { Args: never; Returns: undefined }
      run_screenshot_processor: { Args: never; Returns: undefined }
      run_vision_validator: { Args: never; Returns: undefined }
      send_email_report: {
        Args: { recipients: string[]; report_type: string }
        Returns: string
      }
      send_email_reports_per_org: {
        Args: { report_type: string }
        Returns: undefined
      }
      send_email_via_resend: {
        Args: {
          from_email?: string
          html_content: string
          subject: string
          to_emails: string[]
        }
        Returns: Json
      }
      test_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobname: string
          schedule: string
        }[]
      }
      test_email_system: { Args: never; Returns: string }
      test_http_response: { Args: never; Returns: string }
      text_to_bytea: { Args: { data: string }; Returns: string }
      trigger_employee_notification: {
        Args: { change_type?: string; employee_id: string }
        Returns: boolean
      }
      trigger_manual_email_report: {
        Args: { report_type?: string }
        Returns: string
      }
      unpause_user: {
        Args: { admin_user_id: string; target_user_id: string }
        Returns: boolean
      }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      verify_system_health: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
