-- Extend medicines with inventory fields
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS generic_name text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS batch_number text;

-- Atomic stock decrement that refuses to go negative.
-- Returns the new stock value, or NULL if the row was missing or insufficient stock.
CREATE OR REPLACE FUNCTION public.decrement_stock(_id uuid, _qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stock integer;
BEGIN
  UPDATE public.medicines
     SET stock = stock - _qty,
         updated_at = now()
   WHERE id = _id
     AND stock >= _qty
   RETURNING stock INTO new_stock;
  RETURN new_stock;
END;
$$;