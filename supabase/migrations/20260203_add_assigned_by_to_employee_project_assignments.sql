-- Migration: Add assigned_by column to employee_project_assignments
-- This fixes the error: "Could not find the 'assigned_by' column of 'employee_project_assignments' in the schema cache"

-- Add assigned_by column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'employee_project_assignments' 
        AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.employee_project_assignments 
        ADD COLUMN assigned_by UUID REFERENCES public.users(id);
        
        RAISE NOTICE 'Added assigned_by column to employee_project_assignments';
    ELSE
        RAISE NOTICE 'assigned_by column already exists in employee_project_assignments';
    END IF;
END $$;

-- Also ensure assigned_at column exists (as it's used in the original schema)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'employee_project_assignments' 
        AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE public.employee_project_assignments 
        ADD COLUMN assigned_at TIMESTAMPTZ DEFAULT NOW();
        
        RAISE NOTICE 'Added assigned_at column to employee_project_assignments';
    ELSE
        RAISE NOTICE 'assigned_at column already exists in employee_project_assignments';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.employee_project_assignments.assigned_by IS 'The admin user who assigned this project to the employee';
