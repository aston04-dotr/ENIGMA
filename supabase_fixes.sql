-- SUPABASE SCHEMA FIXES
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- ============================================
-- 1. FIX PROFILES TABLE - Add missing columns
-- ============================================

-- First, check what columns exist (this is a query, not a change)
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';

-- Add missing columns to profiles table
ALTER TABLE IF EXISTS public.profiles 
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS public_id TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS phone_updated_at TIMESTAMP WITH TIME ZONE;

-- Add unique constraint on public_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_public_id_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_public_id_key UNIQUE (public_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add unique constraint on public_id: %', SQLERRM;
END $$;

-- ============================================
-- 2. TRIGGER: Auto-create profile on signup
-- ============================================

-- Create the function that will be triggered
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (
    NEW.id, 
    NEW.email,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists (to avoid errors)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. CREATE FAVORITES TABLE
-- ============================================

-- Create favorites table
CREATE TABLE IF NOT EXISTS public.listing_favorites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_listing_favorites_user_id ON public.listing_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_listing_favorites_listing_id ON public.listing_favorites(listing_id);

-- Enable RLS on favorites
ALTER TABLE public.listing_favorites ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid errors
DROP POLICY IF EXISTS "Users can view own favorites" ON public.listing_favorites;
DROP POLICY IF EXISTS "Users can insert own favorites" ON public.listing_favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON public.listing_favorites;

-- Create RLS policies
CREATE POLICY "Users can view own favorites" 
  ON public.listing_favorites 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites" 
  ON public.listing_favorites 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites" 
  ON public.listing_favorites 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- ============================================
-- 4. RPC FUNCTION: listing_favorites_count
-- ============================================

CREATE OR REPLACE FUNCTION public.listing_favorites_count(listing UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER 
    FROM public.listing_favorites 
    WHERE listing_id = listing
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. RPC FUNCTION: listing_favorites_counts (batch)
-- ============================================

CREATE OR REPLACE FUNCTION public.listing_favorites_counts(p_ids UUID[])
RETURNS TABLE(listing_id UUID, favorite_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lf.listing_id,
    COUNT(*)::BIGINT as favorite_count
  FROM public.listing_favorites lf
  WHERE lf.listing_id = ANY(p_ids)
  GROUP BY lf.listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Ensure profiles table exists with minimal columns
-- ============================================

-- Create profiles table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  name TEXT,
  avatar_url TEXT,
  public_id TEXT,
  device_id TEXT,
  trust_score INTEGER DEFAULT 0,
  phone_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Create RLS policies
CREATE POLICY "Users can view own profile" 
  ON public.profiles 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 7. Backfill existing users with profiles
-- ============================================

-- Insert profiles for existing auth.users that don't have one
INSERT INTO public.profiles (id, email, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Done!
-- Run this query to verify: SELECT COUNT(*) FROM public.profiles;
