
-- Confirm the user moaazibrahim721@gmail.com by setting email confirmation timestamp
-- Note: confirmed_at is a generated column, so we only update email_confirmed_at
UPDATE auth.users 
SET 
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE email = 'moaazibrahim721@gmail.com';

-- Ensure the user exists in public.users table with proper role
INSERT INTO public.users (id, email, full_name, role)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)) as full_name,
  'employee' as role
FROM auth.users au
WHERE au.email = 'moaazibrahim721@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.users pu WHERE pu.id = au.id
  );

-- Verify the user is properly set up
SELECT 
  au.email,
  au.email_confirmed_at,
  au.confirmed_at,
  pu.role,
  pu.full_name
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE au.email = 'moaazibrahim721@gmail.com';
