import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Service key to bypass RLS for server operations

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase URL or Service Key is missing. Check your .env file.');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
