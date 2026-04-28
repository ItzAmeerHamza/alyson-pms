-- Fix suspicious_activity table schema
-- This ensures the table matches what the backend code expects

-- First, let's create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.suspicious_activity (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    activity_type TEXT NOT NULL,
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    details TEXT,
    category TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
ALTER TABLE public.suspicious_activity ADD COLUMN IF NOT EXISTS activity_type TEXT;
ALTER TABLE public.suspicious_activity ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE public.suspicious_activity ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.suspicious_activity ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.suspicious_activity ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT FALSE;

-- Add check constraint for risk_score if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'suspicious_activity_risk_score_check' 
        AND table_name = 'suspicious_activity'
    ) THEN
        ALTER TABLE public.suspicious_activity ADD CONSTRAINT suspicious_activity_risk_score_check 
        CHECK (risk_score >= 0 AND risk_score <= 100);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_user_id ON public.suspicious_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_timestamp ON public.suspicious_activity(timestamp);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_category ON public.suspicious_activity(category);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_activity_type ON public.suspicious_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_risk_score ON public.suspicious_activity(risk_score);
CREATE INDEX IF NOT EXISTS idx_suspicious_activity_reviewed ON public.suspicious_activity(reviewed);

-- Enable RLS
ALTER TABLE public.suspicious_activity ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own suspicious activity" ON public.suspicious_activity
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all suspicious activity" ON public.suspicious_activity
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- Update existing records to have default values where needed
UPDATE public.suspicious_activity 
SET 
    activity_type = 'unknown' 
WHERE activity_type IS NULL;

UPDATE public.suspicious_activity 
SET 
    risk_score = 0 
WHERE risk_score IS NULL;

UPDATE public.suspicious_activity 
SET 
    category = 'general' 
WHERE category IS NULL;

UPDATE public.suspicious_activity 
SET 
    reviewed = FALSE 
WHERE reviewed IS NULL;

-- Add comments
COMMENT ON TABLE public.suspicious_activity IS 'Stores automatically detected suspicious activities';
COMMENT ON COLUMN public.suspicious_activity.activity_type IS 'Type of suspicious activity (social_media_usage, entertainment_usage, etc.)';
COMMENT ON COLUMN public.suspicious_activity.risk_score IS 'Risk score from 0-100 based on severity';
COMMENT ON COLUMN public.suspicious_activity.details IS 'Detailed description of the suspicious activity';
COMMENT ON COLUMN public.suspicious_activity.category IS 'Category of the activity (social_media, entertainment, gaming, etc.)';
COMMENT ON COLUMN public.suspicious_activity.reviewed IS 'Whether this activity has been reviewed by admin'; 