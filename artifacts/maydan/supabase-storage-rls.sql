-- =====================================================================
-- Maydan — Supabase Storage RLS policies for the 'avatars' bucket
-- Run in: Supabase Dashboard → SQL Editor
-- Idempotent: safe to run multiple times.
-- =====================================================================
-- This file is a focused extract from supabase-migrations.sql containing
-- ONLY the storage bucket + RLS policy statements. Apply it in the SQL
-- editor of your Supabase project to protect the avatars bucket at the
-- RLS layer. The server-side upload endpoint (artifacts/api-server/
-- src/routes/upload.ts) uses the service role key and bypasses RLS, so
-- it will continue to work either way. These policies make sure that
-- any *direct* client-side upload is also scoped to the authenticated
-- user's own folder.
-- =====================================================================

-- 1. Make sure the avatars bucket exists (public, 5 MB, common image MIME types).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];

-- 2. Make sure RLS is enabled on storage.objects.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Owner-scoped RLS policies for the avatars bucket.
--    Upload path convention (Profile.tsx): `{user_id}/avatar.{ext}`
--    so the first path segment must equal auth.uid().
DO $$
BEGIN
  -- Anyone can read avatars (bucket is public; belt-and-suspenders policy).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'avatars_public_read'
  ) THEN
    CREATE POLICY avatars_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'avatars');
  END IF;

  -- Only authenticated users can upload, and only to their own folder.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'avatars_insert'
  ) THEN
    CREATE POLICY avatars_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  -- Only the owner can update their own avatar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'avatars_update'
  ) THEN
    CREATE POLICY avatars_update ON storage.objects
      FOR UPDATE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;

  -- Only the owner can delete their own avatar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'avatars_delete'
  ) THEN
    CREATE POLICY avatars_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'avatars'
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END $$;

-- =====================================================================
-- After running this, verify the four policies exist:
--   SELECT policyname FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname LIKE 'avatars_%';
-- Expected: avatars_public_read, avatars_insert, avatars_update,
--           avatars_delete  (4 rows).
-- =====================================================================
