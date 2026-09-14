import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Hilfsfunktionen
export async function getEmployees() {
  const { data, error } = await supabase.from('employees').select('*');
  if (error) throw error;
  return data || [];
}

export async function getVacationRequests() {
  const { data, error } = await supabase
    .from('vacation_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createVacationRequest(employeeId, startDate, endDate, reason) {
  const { data, error } = await supabase.from('vacation_requests').insert([
    {
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      reason: reason || '',
      status: 'pending',
    },
  ]).select();
  if (error) throw error;
  return data?.[0];
}

export async function updateVacationRequest(id, status) {
  const { data, error } = await supabase
    .from('vacation_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) throw error;
  return data?.[0];
}

export async function getCarriedOverDays(employeeId, year) {
  const { data, error } = await supabase
    .from('carried_over_days')
    .select('carried_days')
    .eq('employee_id', employeeId)
    .eq('year', year)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data?.carried_days || 0;
}

export async function setCarriedOverDays(employeeId, year, days) {
  const { error } = await supabase
    .from('carried_over_days')
    .upsert({
      employee_id: employeeId,
      year,
      carried_days: days,
    });
  if (error) throw error;
}
