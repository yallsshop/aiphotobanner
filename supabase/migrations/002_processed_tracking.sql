-- Add phone to dealers
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add processing status and processed photo URLs to inventory
-- (inventory table was created outside initial migration)
DO $$
BEGIN
  -- photo_status: pending (new/unprocessed), processed (banners created)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'photo_status'
  ) THEN
    ALTER TABLE inventory ADD COLUMN photo_status TEXT DEFAULT 'pending';
  END IF;

  -- Store processed/bannered photo URLs
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'processed_photo_urls'
  ) THEN
    ALTER TABLE inventory ADD COLUMN processed_photo_urls JSONB DEFAULT '[]';
  END IF;

  -- Store the AI analysis results for reference
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'ai_analysis'
  ) THEN
    ALTER TABLE inventory ADD COLUMN ai_analysis JSONB;
  END IF;

  -- Track when processing completed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE inventory ADD COLUMN processed_at TIMESTAMPTZ;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_inventory_photo_status ON inventory(photo_status);
