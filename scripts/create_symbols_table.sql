-- Create symbols table for trading universe
CREATE TABLE IF NOT EXISTS public.symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fmp_symbol TEXT NOT NULL UNIQUE,
  display_symbol TEXT NOT NULL,
  name TEXT,
  asset_class TEXT NOT NULL CHECK (asset_class IN ('forex', 'crypto', 'stock', 'index', 'commodity')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_symbols_fmp_symbol ON public.symbols (fmp_symbol);
CREATE INDEX IF NOT EXISTS idx_symbols_asset_class ON public.symbols (asset_class);
CREATE INDEX IF NOT EXISTS idx_symbols_is_active ON public.symbols (is_active);

-- Enable RLS
ALTER TABLE public.symbols ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow service_role full access
CREATE POLICY "Service role can manage symbols" ON public.symbols
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policy: Allow public read access to active symbols
CREATE POLICY "Public can view active symbols" ON public.symbols
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.update_symbols_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_symbols_updated_at
  BEFORE UPDATE ON public.symbols
  FOR EACH ROW
  EXECUTE FUNCTION public.update_symbols_updated_at();

-- Insert some default symbols
INSERT INTO public.symbols (fmp_symbol, display_symbol, name, asset_class) VALUES
  ('XAUUSD', 'XAUUSD', 'Gold vs US Dollar', 'forex'),
  ('BTCUSD', 'BTCUSD', 'Bitcoin / USD', 'crypto'),
  ('ETHUSD', 'ETHUSD', 'Ethereum / USD', 'crypto'),
  ('AAPL', 'AAPL', 'Apple Inc.', 'stock'),
  ('NVDA', 'NVDA', 'NVIDIA Corporation', 'stock')
ON CONFLICT (fmp_symbol) DO NOTHING;

