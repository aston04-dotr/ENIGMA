-- SAFE PHONE FIX: Add contact_phone to listings table
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. PROFILES TABLE COLUMNS (for reference - DO NOT OPEN TO PUBLIC)
-- ============================================
-- Current columns in profiles:
-- - id (UUID, PK) - safe
-- - email (TEXT) - PRIVATE, should not be exposed
-- - phone (TEXT) - PRIVATE, only owner should see in profile settings
-- - name (TEXT) - PRIVATE, only owner should see
-- - avatar_url (TEXT) - could be public but not necessary
-- - public_id (TEXT) - could be public
-- - device_id (TEXT) - PRIVATE, sensitive
-- - trust_score (INTEGER) - could be public
-- - phone_updated_at (TIMESTAMP) - PRIVATE
-- - created_at (TIMESTAMP) - safe
-- - updated_at (TIMESTAMP) - safe
--
-- CONCLUSION: profiles table contains PRIVATE data
-- NEVER use USING (true) on profiles SELECT

-- ============================================
-- 2. ADD contact_phone TO LISTINGS (SAFE SOLUTION)
-- ============================================

-- Add contact_phone column to listings
ALTER TABLE public.listings 
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_listings_contact_phone 
  ON public.listings(contact_phone) 
  WHERE contact_phone IS NOT NULL;

-- ============================================
-- 3. FIX RLS POLICY ON PROFILES (RESTORE SAFE VERSION)
-- ============================================

-- Drop the dangerous open policy if it exists
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profile basics" ON public.profiles;

-- Restore SAFE policy: only view own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id);

-- Update/Insert only for own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 4. ENSURE LISTINGS RLS ALLOWS READING contact_phone
-- ============================================

-- Listings should be readable by everyone (public feed)
-- Check if RLS is enabled on listings
-- If listings has restrictive policies, ensure contact_phone is accessible

-- Enable RLS on listings if not already enabled
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Drop and recreate safe SELECT policy for listings
DROP POLICY IF EXISTS "Listings are viewable by everyone" ON public.listings;
CREATE POLICY "Listings are viewable by everyone" 
  ON public.listings 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Users can only insert/update their own listings
DROP POLICY IF EXISTS "Users can insert own listings" ON public.listings;
CREATE POLICY "Users can insert own listings" 
  ON public.listings 
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own listings" ON public.listings;
CREATE POLICY "Users can update own listings" 
  ON public.listings 
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5. MIGRATION: Copy existing phone data to listings
-- ============================================

-- Update existing listings to have contact_phone from author's profile
-- This is a one-time migration
UPDATE public.listings l
SET contact_phone = p.phone
FROM public.profiles p
WHERE l.user_id = p.id 
  AND l.contact_phone IS NULL 
  AND p.phone IS NOT NULL;

-- Done! Now phone is safely stored in listings.contact_phone
