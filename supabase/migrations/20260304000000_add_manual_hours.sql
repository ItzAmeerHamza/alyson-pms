-- Manual Hours feature: allows admins to add manual time entries for employees

CREATE TABLE IF NOT EXISTS public.manual_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  total_minutes INTEGER NOT NULL CHECK (total_minutes > 0),
  reason TEXT NOT NULL,
  project TEXT,
  task TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.manual_hours_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manual_hours_id UUID REFERENCES public.manual_hours(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  old_data JSONB,
  new_data JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manual_hours_employee_id ON public.manual_hours(employee_id);
CREATE INDEX IF NOT EXISTS idx_manual_hours_date ON public.manual_hours(date);
CREATE INDEX IF NOT EXISTS idx_manual_hours_organization_id ON public.manual_hours(organization_id);
CREATE INDEX IF NOT EXISTS idx_manual_hours_audit_manual_hours_id ON public.manual_hours_audit(manual_hours_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_manual_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_manual_hours_updated_at ON public.manual_hours;
CREATE TRIGGER set_manual_hours_updated_at
  BEFORE UPDATE ON public.manual_hours
  FOR EACH ROW EXECUTE FUNCTION update_manual_hours_updated_at();

-- RLS policies
ALTER TABLE public.manual_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_hours_audit ENABLE ROW LEVEL SECURITY;

-- Admins can do everything within their org
CREATE POLICY "admins_manage_manual_hours" ON public.manual_hours
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role = 'admin'
        AND (organization_id = manual_hours.organization_id OR organization_id IS NULL)
    )
  );

-- Employees can read their own manual hours
CREATE POLICY "employees_view_own_manual_hours" ON public.manual_hours
  FOR SELECT
  USING (employee_id = auth.uid());

-- Admins can read audit log
CREATE POLICY "admins_view_manual_hours_audit" ON public.manual_hours_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can insert audit entries
CREATE POLICY "admins_insert_manual_hours_audit" ON public.manual_hours_audit
  FOR INSERT
  WITH CHECK (changed_by = auth.uid());
