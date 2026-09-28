-- Golden Prime PG Supabase Storage handoff
-- Generated from the active project on 2026-08-26T17:23:26.743Z
-- Bucket: golden-prime-images
-- Runtime posture: private bucket; server-side signed URLs; browser has no direct Storage Data API access.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('golden-prime-images', 'golden-prime-images', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- No storage.objects CREATE POLICY statements are present intentionally.
-- The private bucket is accessed only by the server using SUPABASE_SECRET_KEY; the browser never queries Storage directly.

-- Keep the bucket private. Do not create permissive anon/authenticated policies for this application.
-- The application uploads with SUPABASE_SECRET_KEY and serves 60-second signed URLs through /manus-storage.
