-- Migration: Add organization_id column to warning_messages table
-- This fixes the schema mismatch where frontend code references organization_id but the column doesn't exist

-- Add organization_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'warning_messages' 
        AND column_name = 'organization_id'
    ) THEN
        ALTER TABLE public.warning_messages 
        ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
        
        RAISE NOTICE 'Added organization_id column to warning_messages';
    ELSE
        RAISE NOTICE 'organization_id column already exists in warning_messages';
    END IF;
END $$;

-- Create index for organization lookups
CREATE INDEX IF NOT EXISTS idx_warning_messages_organization_id 
ON public.warning_messages(organization_id);

-- Add comment for documentation
COMMENT ON COLUMN public.warning_messages.organization_id IS 'Organization this warning message belongs to for multi-tenant filtering';
