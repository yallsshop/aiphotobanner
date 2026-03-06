-- Add phone and description_must_haves to dealers
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS description_must_haves TEXT DEFAULT '';
