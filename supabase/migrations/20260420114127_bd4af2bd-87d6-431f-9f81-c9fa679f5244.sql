
-- Medicines catalog
CREATE TABLE public.medicines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_medicines_name ON public.medicines (lower(name));

-- Invoices header
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_created_at ON public.invoices (created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_medicines_updated_at
BEFORE UPDATE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Single-tenant POS: open access (operator-only app, no auth)
CREATE POLICY "Public read medicines" ON public.medicines FOR SELECT USING (true);
CREATE POLICY "Public insert medicines" ON public.medicines FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update medicines" ON public.medicines FOR UPDATE USING (true);
CREATE POLICY "Public delete medicines" ON public.medicines FOR DELETE USING (true);

CREATE POLICY "Public read invoices" ON public.invoices FOR SELECT USING (true);
CREATE POLICY "Public insert invoices" ON public.invoices FOR INSERT WITH CHECK (true);

-- Seed a few sample medicines
INSERT INTO public.medicines (name, unit_price, stock) VALUES
  ('Paracetamol 500mg', 5.00, 200),
  ('Amoxicillin 250mg', 12.00, 150),
  ('Ibuprofen 400mg', 8.50, 100),
  ('Cetirizine 10mg', 3.00, 300),
  ('Omeprazole 20mg', 15.00, 80),
  ('Azithromycin 500mg', 45.00, 60),
  ('Metformin 500mg', 6.50, 120),
  ('Aspirin 75mg', 2.50, 250),
  ('Vitamin C 500mg', 4.00, 400),
  ('Cough Syrup 100ml', 65.00, 50);
