-- ============================================================
-- AIden Step 3: Orders + Payment 関連カラム追加
-- 実行場所: Supabase Dashboard → SQL Editor
-- ============================================================

DO $$
BEGIN
  -- payment_intent_id: Stripe PaymentIntent ID
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_intent_id') THEN
    ALTER TABLE orders ADD COLUMN payment_intent_id TEXT;
  END IF;

  -- payment_status: authorized / captured / failed / refunded
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_status') THEN
    ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
  END IF;

  -- total_amount
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='total_amount') THEN
    ALTER TABLE orders ADD COLUMN total_amount INTEGER DEFAULT 0;
  END IF;

  -- order_type: dinein / takeout / delivery
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='order_type') THEN
    ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'takeout';
  END IF;

  -- member_id reference
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='member_id') THEN
    ALTER TABLE orders ADD COLUMN member_id UUID;
  END IF;

  -- order_items.size_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='size_id') THEN
    ALTER TABLE order_items ADD COLUMN size_id UUID;
  END IF;

  -- order_items.unit_price
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='unit_price') THEN
    ALTER TABLE order_items ADD COLUMN unit_price INTEGER DEFAULT 0;
  END IF;

  -- order_items.subtotal
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='subtotal') THEN
    ALTER TABLE order_items ADD COLUMN subtotal INTEGER DEFAULT 0;
  END IF;
END
$$;
