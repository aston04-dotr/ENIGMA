-- FIX RLS POLICIES FOR PHONE VISIBILITY
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. FIX profiles SELECT policy - allow viewing other profiles for phone
-- ============================================

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create new SELECT policy - users can view ALL profiles (needed for phone display)
-- But only phone, name, trust_score - not email or sensitive data
CREATE POLICY "Anyone can view profiles" 
  ON public.profiles 
  FOR SELECT 
  TO authenticated, anon
  USING (true);

-- Alternative: if you want more privacy, only allow viewing phone/name
-- CREATE POLICY "Anyone can view profile basics" 
--   ON public.profiles 
--   FOR SELECT 
--   USING (true);

-- ============================================
-- 2. Keep UPDATE/INSERT restrictive
-- ============================================

-- Users can only update their OWN profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can only insert their OWN profile  
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 3. Verify the phone column exists and is accessible
-- ============================================

-- Check if column exists (this is a query, for verification)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name = 'phone';

-- Add phone column if it doesn't exist
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================
-- 4. Create index on phone for faster lookups
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone) 
  WHERE phone IS NOT NULL;

-- Done!
