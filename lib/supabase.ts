import { createClient } from '@supabase/supabase-js';

// Safely access environment variables
const env = (import.meta as any).env || {};

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || 'https://bmjzveintdaoszaygbco.supabase.co';
const supabaseAnonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtanp2ZWludGRhb3N6YXlnYmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjE0NDMsImV4cCI6MjA4NTc5NzQ0M30.azXjxHa-qkWBxSWPGb_p6TsVvBF7WRXc3dD-QbxO5OY';

if ((!process.env.PUBLIC_SUPABASE_URL && !env.VITE_SUPABASE_URL) || 
    (!process.env.PUBLIC_SUPABASE_ANON_KEY && !env.VITE_SUPABASE_ANON_KEY)) {
  console.warn('Supabase credentials are missing. Using placeholder values to prevent crash.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
