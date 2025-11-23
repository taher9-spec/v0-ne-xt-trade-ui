-- ============================================
-- CREATE CONVERSATIONS AND MESSAGES TABLES
-- For project: pmxnyekezghulybftuqh
-- ============================================

-- 1. Create conversations table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text,
  signal_id uuid REFERENCES public.signals(id) ON DELETE SET NULL,
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create messages table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Enable RLS on both tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Users can insert their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Service role can manage conversations" ON public.conversations;
DROP POLICY IF EXISTS "Service role can manage messages" ON public.messages;

-- 5. Create RLS policies for service role (allows API routes to work)
CREATE POLICY "Service role can manage conversations" ON public.conversations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can manage messages" ON public.messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. Allow authenticated users to view their own conversations
CREATE POLICY "Users can view their own conversations" ON public.conversations
  FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE id = user_id) OR auth.role() = 'service_role');

-- 7. Allow authenticated users to view messages in their conversations
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM public.conversations 
      WHERE user_id IN (SELECT id FROM public.users WHERE id = user_id)
    ) OR auth.role() = 'service_role'
  );

-- 8. Verify full_name column exists in users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'users' 
    AND column_name = 'full_name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN full_name text;
    RAISE NOTICE 'Added full_name column to users table';
  ELSE
    RAISE NOTICE 'full_name column already exists in users table';
  END IF;
END $$;

-- 9. Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERIES (run these to confirm)
-- ============================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('conversations', 'messages');
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'full_name';

