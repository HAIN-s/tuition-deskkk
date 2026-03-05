import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth helpers ─────────────────────────────────────────────────────────────
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { data, error };
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function getUser() {
  return supabase.auth.getUser();
}

// ── DB helpers ────────────────────────────────────────────────────────────────
export async function dbLoad(table, userId) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) { console.error('dbLoad error', table, error); return []; }
  return data || [];
}

export async function dbUpsert(table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) console.error('dbUpsert error', table, error);
  return !error;
}

export async function dbDelete(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error('dbDelete error', table, error);
  return !error;
}

export async function dbDeleteAll(table, userId) {
  const { error } = await supabase.from(table).delete().eq('user_id', userId);
  if (error) console.error('dbDeleteAll error', table, error);
  return !error;
}
