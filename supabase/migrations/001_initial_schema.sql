-- Dealer accounts (multi-tenant root)
CREATE TABLE dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  logo_url TEXT,
  brand_colors JSONB DEFAULT '{"primary": "#000000", "secondary": "#FFFFFF"}',
  default_template_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Processing batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  vehicle_vin TEXT,
  vehicle_data JSONB,
  status TEXT DEFAULT 'uploading',
  total_photos INT DEFAULT 0,
  processed_photos INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual photos
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
  dealer_id UUID NOT NULL,
  original_path TEXT NOT NULL,
  bannered_path TEXT,
  ad_path TEXT,
  status TEXT DEFAULT 'uploaded',
  analysis JSONB,
  banner_config JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Banner templates
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  preview_url TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dealers_user_id ON dealers(user_id);
CREATE INDEX idx_batches_dealer_id ON batches(dealer_id);
CREATE INDEX idx_photos_batch_id ON photos(batch_id);
CREATE INDEX idx_photos_dealer_id ON photos(dealer_id);
CREATE INDEX idx_photos_status ON photos(status);
CREATE INDEX idx_templates_dealer_id ON templates(dealer_id);

-- RLS Policies
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Dealers: users can only see/modify their own dealer record
CREATE POLICY "Users manage own dealer" ON dealers
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can insert dealer on signup" ON dealers
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Batches: dealers can only see their own batches
CREATE POLICY "Dealers manage own batches" ON batches
  FOR ALL USING (
    dealer_id IN (SELECT id FROM dealers WHERE user_id = auth.uid())
  );

-- Photos: dealers can only see their own photos
CREATE POLICY "Dealers manage own photos" ON photos
  FOR ALL USING (
    dealer_id IN (SELECT id FROM dealers WHERE user_id = auth.uid())
  );

-- Templates: dealers see their own + system templates (dealer_id IS NULL)
CREATE POLICY "Dealers see own and system templates" ON templates
  FOR SELECT USING (
    dealer_id IS NULL OR
    dealer_id IN (SELECT id FROM dealers WHERE user_id = auth.uid())
  );

CREATE POLICY "Dealers manage own templates" ON templates
  FOR ALL USING (
    dealer_id IN (SELECT id FROM dealers WHERE user_id = auth.uid())
  );

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dealers_updated_at
  BEFORE UPDATE ON dealers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
