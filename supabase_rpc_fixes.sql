-- RPC FUNCTIONS FOR FAVORITES
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Single listing favorite count
-- ============================================
CREATE OR REPLACE FUNCTION public.listing_favorites_count(listing UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT COUNT(*)::INTEGER 
     FROM public.listing_favorites 
     WHERE listing_id = listing),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Batch listing favorite counts
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
-- 3. Alternative signature (for backwards compatibility)
-- ============================================
CREATE OR REPLACE FUNCTION public.listing_favorites_counts(listing_ids UUID[])
RETURNS TABLE(listing_id UUID, favorite_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lf.listing_id,
    COUNT(*)::BIGINT as favorite_count
  FROM public.listing_favorites lf
  WHERE lf.listing_id = ANY(listing_ids)
  GROUP BY lf.listing_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
