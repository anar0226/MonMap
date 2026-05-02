import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Review {
  id: number;
  author_name: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export function useReviews(placeId: string | null) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('reviews')
        .select('id, author_name, rating, body, created_at')
        .eq('place_id', id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setReviews((data as Review[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitReview = useCallback(async (
    id: string,
    authorName: string,
    rating: number,
    body: string,
  ): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('reviews')
        .insert({ place_id: id, author_name: authorName, rating, body: body || null });
      if (err) throw err;
      await fetchReviews(id);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit review');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [fetchReviews]);

  return { reviews, loading, submitting, error, fetchReviews, submitReview };
}

export function computeRatingBars(reviews: Review[]): number[] {
  if (reviews.length === 0) return [0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0];
  for (const r of reviews) counts[5 - r.rating]++;
  return counts.map(c => Math.round((c / reviews.length) * 100));
}

export function computeAverageRating(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}
