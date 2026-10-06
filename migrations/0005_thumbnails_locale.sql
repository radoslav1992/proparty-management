-- Uploaded photos can have a small WebP/JPEG thumbnail stored beside them at "<key>.thumb".
ALTER TABLE files ADD COLUMN has_thumb INTEGER NOT NULL DEFAULT 0 CHECK(has_thumb IN (0,1));
-- How dates and amounts are formatted in the workspace (a BCP 47 tag from the allowed list).
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-GB';
