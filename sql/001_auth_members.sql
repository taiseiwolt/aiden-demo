-- ============================================================
-- AIden Step 1-1: Supabase Auth + members テーブル整備
-- 実行場所: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. members テーブルにカラム追加（既存テーブルを拡張）
-- 既にあるカラムはスキップされる（IF NOT EXISTS相当）
DO $$
BEGIN
  -- auth_user_id: Supabase Auth との紐づけ
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='auth_user_id') THEN
    ALTER TABLE members ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_members_auth_user_id ON members(auth_user_id);
  END IF;

  -- 名前（姓・名分割）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='first_name') THEN
    ALTER TABLE members ADD COLUMN first_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='last_name') THEN
    ALTER TABLE members ADD COLUMN last_name TEXT;
  END IF;

  -- メールアドレス
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='email') THEN
    ALTER TABLE members ADD COLUMN email TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email ON members(email);
  END IF;

  -- 電話番号
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='phone') THEN
    ALTER TABLE members ADD COLUMN phone TEXT;
  END IF;

  -- 性別
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='gender') THEN
    ALTER TABLE members ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female', 'other'));
  END IF;

  -- 生年月日
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='birth_date') THEN
    ALTER TABLE members ADD COLUMN birth_date DATE;
  END IF;

  -- 住所（4分割）
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='address_prefecture') THEN
    ALTER TABLE members ADD COLUMN address_prefecture TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='address_city') THEN
    ALTER TABLE members ADD COLUMN address_city TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='address_street') THEN
    ALTER TABLE members ADD COLUMN address_street TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='address_building') THEN
    ALTER TABLE members ADD COLUMN address_building TEXT;
  END IF;

  -- Stripe Customer ID
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='stripe_customer_id') THEN
    ALTER TABLE members ADD COLUMN stripe_customer_id TEXT;
  END IF;

  -- LINE User ID
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='line_user_id') THEN
    ALTER TABLE members ADD COLUMN line_user_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_members_line_user_id ON members(line_user_id);
  END IF;

  -- タイムスタンプ
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='created_at') THEN
    ALTER TABLE members ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='updated_at') THEN
    ALTER TABLE members ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END
$$;

-- 2. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_members_updated_at ON members;
CREATE TRIGGER set_members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. RLS（Row Level Security）有効化 + ポリシー設定

-- members テーブル
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除してから再作成（べき等）
DROP POLICY IF EXISTS "members_select_own" ON members;
DROP POLICY IF EXISTS "members_update_own" ON members;
DROP POLICY IF EXISTS "members_insert_own" ON members;
DROP POLICY IF EXISTS "members_service_role_all" ON members;

-- 本人のみ読み取り可
CREATE POLICY "members_select_own" ON members
  FOR SELECT USING (auth.uid() = auth_user_id);

-- 本人のみ更新可
CREATE POLICY "members_update_own" ON members
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- 認証済みユーザーのみ挿入可（自分のレコード）
CREATE POLICY "members_insert_own" ON members
  FOR INSERT WITH CHECK (auth.uid() = auth_user_id);

-- Service Role は全操作可能（API サーバー用）
CREATE POLICY "members_service_role_all" ON members
  FOR ALL USING (auth.role() = 'service_role');

-- orders テーブル（本人の注文のみ読み取り可）
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_own" ON orders;
DROP POLICY IF EXISTS "orders_service_role_all" ON orders;

-- member_id で本人の注文を読み取り可
CREATE POLICY "orders_select_own" ON orders
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM members WHERE auth_user_id = auth.uid()
    )
  );

-- Service Role は全操作可能（API サーバー用）
CREATE POLICY "orders_service_role_all" ON orders
  FOR ALL USING (auth.role() = 'service_role');

-- order_items テーブル
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select_own" ON order_items;
DROP POLICY IF EXISTS "order_items_service_role_all" ON order_items;

CREATE POLICY "order_items_select_own" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE member_id IN (
        SELECT id FROM members WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "order_items_service_role_all" ON order_items
  FOR ALL USING (auth.role() = 'service_role');
