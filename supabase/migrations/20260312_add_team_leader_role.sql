-- Migration: Add team_leader role and team_leader_assignments table
-- Date: 2026-03-12

-- 1. Create team_leader_assignments table
CREATE TABLE IF NOT EXISTS team_leader_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_leader_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (team_leader_id, employee_id)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tla_team_leader_id ON team_leader_assignments(team_leader_id);
CREATE INDEX IF NOT EXISTS idx_tla_employee_id ON team_leader_assignments(employee_id);

-- 3. Enable RLS
ALTER TABLE team_leader_assignments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- Admins can do everything
CREATE POLICY "Admins can manage all team assignments"
  ON team_leader_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Team leaders can read their own assignments
CREATE POLICY "Team leaders can view their own assignments"
  ON team_leader_assignments
  FOR SELECT
  TO authenticated
  USING (
    team_leader_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'team_leader'
    )
  );
