-- Ensure project deletes never fail on FK RESTRICT/NO ACTION.
-- Safe to re-run: drops and recreates the known project_id FKs with explicit actions.

ALTER TABLE time_doctor.employee_project_assignments
  DROP CONSTRAINT IF EXISTS employee_project_assignments_project_id_fkey;

ALTER TABLE time_doctor.employee_project_assignments
  ADD CONSTRAINT employee_project_assignments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES time_doctor.projects(id) ON DELETE CASCADE;

ALTER TABLE time_doctor.time_logs
  DROP CONSTRAINT IF EXISTS time_logs_project_id_fkey;

ALTER TABLE time_doctor.time_logs
  ADD CONSTRAINT time_logs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES time_doctor.projects(id) ON DELETE SET NULL;

ALTER TABLE time_doctor.idle_logs
  DROP CONSTRAINT IF EXISTS idle_logs_project_id_fkey;

ALTER TABLE time_doctor.idle_logs
  ADD CONSTRAINT idle_logs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES time_doctor.projects(id) ON DELETE SET NULL;
