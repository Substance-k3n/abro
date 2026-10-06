-- Roadmap Phase 4 (docs/DECISIONS.md ADR-017): profile and group photos,
-- stored in the same private bucket as receipts and served through the
-- API. The object key lives here; profiles.avatar_url keeps holding what
-- clients display (an uploaded photo's versioned API path, or the Google
-- picture URL), so every existing response that embeds a profile shows
-- the photo without changes.
ALTER TABLE profiles ADD COLUMN avatar_path TEXT;
ALTER TABLE groups ADD COLUMN photo_path TEXT;
