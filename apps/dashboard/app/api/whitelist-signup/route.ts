import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  // expects: { name, email, clinic_type }
  const { name, email, clinic_type } = body;
  if (!name || !email || !clinic_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const { error } = await supabase.from('whitelist_signups').insert([{ name, email, clinic_type }]);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
