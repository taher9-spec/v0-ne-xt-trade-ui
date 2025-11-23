-- ============================================
-- FIX USERS TABLE RLS POLICIES
-- For project: pmxnyekezghulybftuqh
-- This allows Telegram auth to work with service role
-- ============================================

-- 1. Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Service role can manage users" ON public.users;

-- 2. Create service role policy (allows API routes to insert/update users)
CREATE POLICY "Service role can manage users" ON public.users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3. Allow authenticated users to view their own profile
CREATE POLICY "Users can view their own profile" ON public.users
  FOR SELECT
  USING (auth.uid() = id OR auth.role() = 'service_role');

-- 4. Allow authenticated users to update their own profile
CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE
  USING (auth.uid() = id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = id OR auth.role() = 'service_role');

-- 5. Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';

