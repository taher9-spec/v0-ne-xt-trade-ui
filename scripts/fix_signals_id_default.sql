-- Fix signals.id default value
-- The default was incorrectly set as a string "Default: gen_random_uuid()" instead of the function call

ALTER TABLE public.signals
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.signals
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Verify the fix
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'signals' 
  AND column_name = 'id';

