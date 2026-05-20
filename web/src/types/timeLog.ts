
export interface TimeLog {
  id: string;
  start_time: string;
  end_time: string | null;
  is_idle: boolean;
  project_id: string | null;
  task_id?: string | null;
  user_id: string;
  idle_seconds?: number | null;
  deducted_seconds?: number | null;
  project_name?: string;
  user_name?: string;
}

export interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  is_idle: boolean;
  project_id: string | null;
  projects?: { name: string } | null;
}

export interface TimeReport {
  id: string;
  start_time: string;
  end_time: string | null;
  is_idle: boolean;
  project_id: string | null;
  user_id: string;
  user_name: string;
  user_email: string;
  project_name: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: TimeLog;
}
