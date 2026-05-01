import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, ...fields } = body as Record<string, unknown>;

    if (!type || !fields.legal_name || !fields.email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();

    if (type === 'talent') {
      const { error } = await supabase.from('atelier_talent').insert({
        legal_name: fields.legal_name as string,
        working_name: (fields.working_name as string) || (fields.legal_name as string),
        email: fields.email as string,
        mobile: (fields.mobile as string) || null,
        pronouns: (fields.pronouns as string) || null,
        abn: (fields.abn as string) || null,
        gst_registered: fields.gst_registered === true,
        instagram: (fields.instagram as string) || null,
        website: (fields.website as string) || null,
        emergency_name: (fields.emergency_name as string) || null,
        emergency_relationship: (fields.emergency_relationship as string) || null,
        emergency_mobile: (fields.emergency_mobile as string) || null,
        super_fund_name: (fields.super_fund_name as string) || null,
        super_member_number: (fields.super_member_number as string) || null,
        super_usi: (fields.super_usi as string) || null,
        is_active: false, // Needs Jasper's review before activation
        onboarding_completed: true,
      });

      if (error) {
        console.error('[onboard] talent insert', error.message);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    } else if (type === 'crew') {
      const { error } = await supabase.from('atelier_crew').insert({
        name: fields.legal_name as string,
        email: fields.email as string,
        mobile: (fields.mobile as string) || null,
        abn: (fields.abn as string) || null,
        gst_registered: fields.gst_registered === true,
        primary_role: (fields.primary_role as string) || null,
        super_fund_name: (fields.super_fund_name as string) || null,
        super_member_number: (fields.super_member_number as string) || null,
        super_usi: (fields.super_usi as string) || null,
        tier: 'regular_freelance',
        is_active: false, // Needs Jasper's review
        onboarding_completed: true,
      });

      if (error) {
        console.error('[onboard] crew insert', error.message);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
