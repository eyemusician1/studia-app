import { supabase } from './supabase';

export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  studentId: string
) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // Insert profile immediately after signup using the new user's ID
  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      first_name: firstName,
      last_name: lastName,
      student_id: studentId,
    });
    if (profileError) throw profileError;
  }

  // Sign out so user must log in manually
  await supabase.auth.signOut();
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}