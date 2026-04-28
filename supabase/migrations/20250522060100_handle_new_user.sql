-- Create function to handle new auth users and set default role

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  metadata jsonb;
BEGIN
  metadata := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  IF metadata ? 'role' THEN
    -- role already provided
    metadata := metadata;
  ELSE
    metadata := jsonb_set(metadata, '{role}', '"employee"');
  END IF;

  -- update metadata on auth.users
  NEW.raw_user_meta_data := metadata;

  -- insert into public.users table
  INSERT INTO public.users(id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(metadata->>'full_name', NEW.email),
    metadata->>'avatar_url',
    metadata->>'role'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
