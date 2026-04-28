-- Warnings and Deductions Enhancement
-- Adds deductions tracking and warning system for the Finance & Payroll screen

-- Create employee_deductions table for tracking manual deductions
CREATE TABLE IF NOT EXISTS public.employee_deductions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    month_year DATE NOT NULL, -- Format: YYYY-MM-01
    deduction_type TEXT NOT NULL CHECK (deduction_type IN ('late', 'absent', 'disciplinary', 'other')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    reason TEXT NOT NULL,
    created_by UUID REFERENCES public.users(id) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create employee_warnings table for tracking compliance warnings
CREATE TABLE IF NOT EXISTS public.employee_warnings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    month_year DATE NOT NULL, -- Format: YYYY-MM-01
    warning_type TEXT NOT NULL CHECK (warning_type IN ('below_hours', 'below_days', 'productivity_low', 'attendance_issue')),
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
    message TEXT NOT NULL,
    required_value DECIMAL(10,2), -- Required hours/days
    actual_value DECIMAL(10,2),   -- Actual hours/days worked
    gap_percentage DECIMAL(5,2),  -- Percentage gap
    is_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES public.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create employee working standards table for tracking requirements
CREATE TABLE IF NOT EXISTS public.employee_working_standards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    employment_type TEXT NOT NULL CHECK (employment_type IN ('monthly', 'hourly')),
    required_hours_monthly DECIMAL(10,2) DEFAULT 160, -- For hourly employees
    required_days_monthly INTEGER DEFAULT 22,         -- For monthly employees
    minimum_hours_daily DECIMAL(10,2) DEFAULT 8,
    overtime_threshold DECIMAL(10,2) DEFAULT 160,
    warning_threshold_percentage DECIMAL(5,2) DEFAULT 90, -- Warn if below 90% of requirement
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_deductions_user_month ON public.employee_deductions(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_employee_deductions_type ON public.employee_deductions(deduction_type);
CREATE INDEX IF NOT EXISTS idx_employee_warnings_user_month ON public.employee_warnings(user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_employee_warnings_reviewed ON public.employee_warnings(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_employee_working_standards_user ON public.employee_working_standards(user_id);

-- Enable RLS
ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_working_standards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_deductions
CREATE POLICY "Admins can manage all deductions" ON public.employee_deductions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Employees can view own deductions" ON public.employee_deductions
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for employee_warnings
CREATE POLICY "Admins can manage all warnings" ON public.employee_warnings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Employees can view own warnings" ON public.employee_warnings
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for employee_working_standards
CREATE POLICY "Admins can manage working standards" ON public.employee_working_standards
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'manager')
        )
    );

CREATE POLICY "Employees can view own standards" ON public.employee_working_standards
    FOR SELECT USING (auth.uid() = user_id);

-- Function to calculate employee compliance for a month
CREATE OR REPLACE FUNCTION calculate_employee_compliance(
    target_user_id UUID,
    target_month DATE
) RETURNS JSON AS $$
DECLARE
    user_record RECORD;
    standards_record RECORD;
    result JSON;
    total_hours DECIMAL(10,2) := 0;
    total_days INTEGER := 0;
    required_hours DECIMAL(10,2);
    required_days INTEGER;
    gap_percentage DECIMAL(5,2);
    compliance_status TEXT;
    warning_level TEXT;
BEGIN
    -- Get user info
    SELECT * INTO user_record FROM public.users WHERE id = target_user_id;
    IF NOT FOUND THEN
        RETURN '{"error": "User not found"}';
    END IF;

    -- Get working standards
    SELECT * INTO standards_record FROM public.employee_working_standards 
    WHERE user_id = target_user_id AND is_active = TRUE;
    
    IF NOT FOUND THEN
        -- Create default standards if not exist
        INSERT INTO public.employee_working_standards (user_id, employment_type)
        VALUES (target_user_id, 'hourly')
        RETURNING * INTO standards_record;
    END IF;

    -- Calculate actual hours worked for the month
    SELECT 
        COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 3600), 0),
        COUNT(DISTINCT DATE(start_time))
    INTO total_hours, total_days
    FROM public.time_logs tl
    WHERE tl.user_id = target_user_id
    AND DATE_TRUNC('month', tl.start_time) = DATE_TRUNC('month', target_month)
    AND tl.end_time IS NOT NULL;

    -- Set requirements based on employment type
    IF standards_record.employment_type = 'hourly' THEN
        required_hours := standards_record.required_hours_monthly;
        gap_percentage := CASE 
            WHEN required_hours > 0 THEN ROUND(((required_hours - total_hours) / required_hours * 100), 2)
            ELSE 0 
        END;
    ELSE
        required_days := standards_record.required_days_monthly;
        gap_percentage := CASE 
            WHEN required_days > 0 THEN ROUND(((required_days - total_days) / required_days::DECIMAL * 100), 2)
            ELSE 0 
        END;
    END IF;

    -- Determine compliance status and warning level
    IF gap_percentage <= 0 THEN
        compliance_status := 'compliant';
        warning_level := 'none';
    ELSIF gap_percentage <= (100 - standards_record.warning_threshold_percentage) THEN
        compliance_status := 'warning';
        warning_level := 'low';
    ELSIF gap_percentage <= 20 THEN
        compliance_status := 'warning';
        warning_level := 'medium';
    ELSE
        compliance_status := 'critical';
        warning_level := 'high';
    END IF;

    -- Build result JSON
    result := json_build_object(
        'user_id', target_user_id,
        'employment_type', standards_record.employment_type,
        'total_hours', total_hours,
        'total_days', total_days,
        'required_hours', required_hours,
        'required_days', required_days,
        'gap_percentage', gap_percentage,
        'compliance_status', compliance_status,
        'warning_level', warning_level,
        'standards', row_to_json(standards_record)
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create automatic warnings based on compliance
CREATE OR REPLACE FUNCTION create_compliance_warning(
    target_user_id UUID,
    target_month DATE
) RETURNS UUID AS $$
DECLARE
    compliance_data JSON;
    warning_id UUID;
    warning_message TEXT;
    employment_type TEXT;
    gap_percentage DECIMAL(5,2);
    warning_level TEXT;
    required_value DECIMAL(10,2);
    actual_value DECIMAL(10,2);
BEGIN
    -- Get compliance data
    compliance_data := calculate_employee_compliance(target_user_id, target_month);
    
    -- Extract values from JSON
    employment_type := compliance_data->>'employment_type';
    gap_percentage := (compliance_data->>'gap_percentage')::DECIMAL;
    warning_level := compliance_data->>'warning_level';
    
    -- Only create warning if there's an issue
    IF warning_level = 'none' THEN
        RETURN NULL;
    END IF;

    -- Build warning message and values based on employment type
    IF employment_type = 'hourly' THEN
        required_value := (compliance_data->>'required_hours')::DECIMAL;
        actual_value := (compliance_data->>'total_hours')::DECIMAL;
        warning_message := format('Employee has worked only %.1f hours out of required %.1f hours (%.1f%% deficit)',
            actual_value, required_value, gap_percentage);
    ELSE
        required_value := (compliance_data->>'required_days')::DECIMAL;
        actual_value := (compliance_data->>'total_days')::DECIMAL;
        warning_message := format('Employee has worked only %s days out of required %s days (%.1f%% deficit)',
            actual_value::INTEGER, required_value::INTEGER, gap_percentage);
    END IF;

    -- Insert warning
    INSERT INTO public.employee_warnings (
        user_id,
        month_year,
        warning_type,
        severity,
        message,
        required_value,
        actual_value,
        gap_percentage
    ) VALUES (
        target_user_id,
        target_month,
        CASE WHEN employment_type = 'hourly' THEN 'below_hours' ELSE 'below_days' END,
        warning_level,
        warning_message,
        required_value,
        actual_value,
        gap_percentage
    )
    RETURNING id INTO warning_id;

    RETURN warning_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get employee summary with warnings and deductions
CREATE OR REPLACE FUNCTION get_employee_finance_summary(
    target_month DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    user_id UUID,
    email TEXT,
    full_name TEXT,
    employment_type TEXT,
    required_hours DECIMAL(10,2),
    required_days INTEGER,
    actual_hours DECIMAL(10,2),
    actual_days INTEGER,
    gap_percentage DECIMAL(5,2),
    compliance_status TEXT,
    warning_level TEXT,
    total_deductions DECIMAL(10,2),
    warning_count INTEGER,
    unreviewed_warnings INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id as user_id,
        u.email,
        u.full_name,
        COALESCE(ews.employment_type, 'hourly') as employment_type,
        COALESCE(ews.required_hours_monthly, 160) as required_hours,
        COALESCE(ews.required_days_monthly, 22) as required_days,
        COALESCE(work_data.total_hours, 0) as actual_hours,
        COALESCE(work_data.total_days, 0) as actual_days,
        CASE 
            WHEN COALESCE(ews.employment_type, 'hourly') = 'hourly' AND COALESCE(ews.required_hours_monthly, 160) > 0 THEN
                ROUND(((COALESCE(ews.required_hours_monthly, 160) - COALESCE(work_data.total_hours, 0)) / COALESCE(ews.required_hours_monthly, 160) * 100), 2)
            WHEN COALESCE(ews.employment_type, 'hourly') = 'monthly' AND COALESCE(ews.required_days_monthly, 22) > 0 THEN
                ROUND(((COALESCE(ews.required_days_monthly, 22) - COALESCE(work_data.total_days, 0)) / COALESCE(ews.required_days_monthly, 22)::DECIMAL * 100), 2)
            ELSE 0
        END as gap_percentage,
        CASE 
            WHEN COALESCE(work_data.total_hours, 0) >= COALESCE(ews.required_hours_monthly, 160) OR 
                 COALESCE(work_data.total_days, 0) >= COALESCE(ews.required_days_monthly, 22) THEN 'compliant'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * COALESCE(ews.warning_threshold_percentage, 90) / 100) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * COALESCE(ews.warning_threshold_percentage, 90) / 100) THEN 'warning'
            ELSE 'critical'
        END as compliance_status,
        CASE 
            WHEN COALESCE(work_data.total_hours, 0) >= COALESCE(ews.required_hours_monthly, 160) OR 
                 COALESCE(work_data.total_days, 0) >= COALESCE(ews.required_days_monthly, 22) THEN 'none'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * 0.8) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * 0.8) THEN 'low'
            WHEN COALESCE(work_data.total_hours, 0) >= (COALESCE(ews.required_hours_monthly, 160) * 0.6) OR
                 COALESCE(work_data.total_days, 0) >= (COALESCE(ews.required_days_monthly, 22) * 0.6) THEN 'medium'
            ELSE 'high'
        END as warning_level,
        COALESCE(deduction_data.total_deductions, 0) as total_deductions,
        COALESCE(warning_data.warning_count, 0) as warning_count,
        COALESCE(warning_data.unreviewed_warnings, 0) as unreviewed_warnings
    FROM public.users u
    LEFT JOIN public.employee_working_standards ews ON ews.user_id = u.id AND ews.is_active = TRUE
    LEFT JOIN (
        SELECT 
            tl.user_id,
            SUM(EXTRACT(EPOCH FROM (COALESCE(tl.end_time, NOW()) - tl.start_time)) / 3600) as total_hours,
            COUNT(DISTINCT DATE(tl.start_time)) as total_days
        FROM public.time_logs tl
        WHERE DATE_TRUNC('month', tl.start_time) = DATE_TRUNC('month', target_month)
        AND tl.end_time IS NOT NULL
        GROUP BY tl.user_id
    ) work_data ON work_data.user_id = u.id
    LEFT JOIN (
        SELECT 
            ed.user_id,
            SUM(ed.amount) as total_deductions
        FROM public.employee_deductions ed
        WHERE DATE_TRUNC('month', ed.month_year) = DATE_TRUNC('month', target_month)
        AND ed.is_active = TRUE
        GROUP BY ed.user_id
    ) deduction_data ON deduction_data.user_id = u.id
    LEFT JOIN (
        SELECT 
            ew.user_id,
            COUNT(*) as warning_count,
            COUNT(CASE WHEN NOT ew.is_reviewed THEN 1 END) as unreviewed_warnings
        FROM public.employee_warnings ew
        WHERE DATE_TRUNC('month', ew.month_year) = DATE_TRUNC('month', target_month)
        GROUP BY ew.user_id
    ) warning_data ON warning_data.user_id = u.id
    WHERE u.role = 'employee' AND u.is_active = TRUE
    ORDER BY u.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION calculate_employee_compliance TO authenticated;
GRANT EXECUTE ON FUNCTION create_compliance_warning TO authenticated;
GRANT EXECUTE ON FUNCTION get_employee_finance_summary TO authenticated;

-- Add triggers for updated_at
CREATE TRIGGER update_employee_deductions_updated_at
    BEFORE UPDATE ON public.employee_deductions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_warnings_updated_at
    BEFORE UPDATE ON public.employee_warnings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_working_standards_updated_at
    BEFORE UPDATE ON public.employee_working_standards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE public.employee_deductions IS 'Manual deductions applied to employee salaries';
COMMENT ON TABLE public.employee_warnings IS 'System-generated and manual warnings for employee compliance';
COMMENT ON TABLE public.employee_working_standards IS 'Working requirements and thresholds for each employee';
COMMENT ON FUNCTION calculate_employee_compliance IS 'Calculates compliance metrics for an employee in a given month';
COMMENT ON FUNCTION create_compliance_warning IS 'Creates automatic warnings based on compliance calculations';
COMMENT ON FUNCTION get_employee_finance_summary IS 'Gets comprehensive finance summary for all employees'; 