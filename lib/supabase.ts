import { createClient } from '@supabase/supabase-js';

// Safely access environment variables
const env = (import.meta as any).env || {};

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are missing. Please check your environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
