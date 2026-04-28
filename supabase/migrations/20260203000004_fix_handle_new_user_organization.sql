-- Fix handle_new_user to include organization_id from metadata

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  metadata jsonb;
  org_id uuid;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  
  -- Set default role if not provided
  IF NOT (metadata ? 'role') THEN
    metadata := jsonb_set(metadata, '{role}', '"employee"');
  END IF;

  -- Extract organization_id from metadata
  org_id := NULL;
  IF metadata ? 'organization_id' AND metadata->>'organization_id' IS NOT NULL AND metadata->>'organization_id' != '' THEN
    org_id := (metadata->>'organization_id')::uuid;
  END IF;

  -- update metadata on auth.users
  NEW.raw_user_meta_data := metadata;

  -- insert into public.users table with organization_id
  INSERT INTO public.users(id, email, full_name, avatar_url, role, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(metadata->>'full_name', NEW.email),
    metadata->>'avatar_url',
    metadata->>'role',
    org_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
