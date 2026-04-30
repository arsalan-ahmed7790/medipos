-- 1) store_settings table (single row keyed by id='default')
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY DEFAULT 'default',
  store_name text NOT NULL DEFAULT 'MEDICAL STORE',
  address_line text,
  phone text,
  footer text DEFAULT 'Thank You — Get Well Soon!',
  paper_width text NOT NULL DEFAULT '80mm', -- '58mm' | '80mm'
  font_size text NOT NULL DEFAULT 'medium', -- 'small' | 'medium' | 'large'
  show_discount boolean NOT NULL DEFAULT true,
  show_unit_price boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read store_settings"
  ON public.store_settings FOR SELECT USING (true);

CREATE POLICY "Public insert store_settings"
  ON public.store_settings FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update store_settings"
  ON public.store_settings FOR UPDATE USING (true);

CREATE TRIGGER store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default row
INSERT INTO public.store_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 2) medicines: add category + low_stock_threshold
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_medicines_name_lower ON public.medicines (lower(name));
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);