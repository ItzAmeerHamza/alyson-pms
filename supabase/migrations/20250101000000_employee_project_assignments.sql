-- Employee Project Assignments Migration
-- This migration creates the employee_project_assignments table for managing project access

-- Create employee_project_assignments table
CREATE TABLE IF NOT EXISTS public.employee_project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES public.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_project_user_id ON public.employee_project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_project_project_id ON public.employee_project_assignments(project_id);

-- Enable RLS
ALTER TABLE public.employee_project_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can view all assignments
CREATE POLICY "Admins can view all assignments" ON public.employee_project_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Employees can view their own assignments
CREATE POLICY "Employees can view own assignments" ON public.employee_project_assignments
  FOR SELECT USING (user_id = auth.uid());

-- Only admins can insert assignments
CREATE POLICY "Admins can insert assignments" ON public.employee_project_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can delete assignments
CREATE POLICY "Admins can delete assignments" ON public.employee_project_assignments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Only admins can update assignments
CREATE POLICY "Admins can update assignments" ON public.employee_project_assignments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Add comment
COMMENT ON TABLE public.employee_project_assignments IS 'Manages which projects employees are assigned to';

