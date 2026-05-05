'use client';

import { useState } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import { submitOnboardingAction } from '@/app/actions/onboarding';
import type { OnboardingPrefill } from '@/lib/data/onboarding';

export default function OnboardingMagicLinkForm({
  token,
  prefill,
}: {
  token: string;
  prefill: OnboardingPrefill;
}) {
  const isTalent = prefill.type === 'talent';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    setError(null);

    const dayRateRaw = formData.get('default_day_rate') as string | null;
    const dayRate = dayRateRaw ? Number(dayRateRaw) : null;

    const res = await submitOnboardingAction(token, {
      legal_name: String(formData.get('legal_name') || ''),
      display_name: String(formData.get('display_name') || ''),
      email: String(formData.get('email') || ''),
      mobile: (formData.get('mobile') as string) || null,
      pronouns: (formData.get('pronouns') as string) || null,
      abn: (formData.get('abn') as string) || null,
      gst_registered: formData.get('gst_registered') === 'true',
      super_fund_name: (formData.get('super_fund_name') as string) || null,
      super_member_number: (formData.get('super_member_number') as string) || null,
      super_usi: (formData.get('super_usi') as string) || null,
      home_address: (formData.get('home_address') as string) || null,
      dob: (formData.get('dob') as string) || null,
      default_day_rate: dayRate && !Number.isNaN(dayRate) ? dayRate : null,
    });

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <div className="rounded-lg border p-8 text-center" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="text-3xl mb-3">✓</div>
        <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>Saved</h2>
        <p className="mt-2 text-sm" style={{ color: PALETTE.muted }}>
          Thanks — your details have been updated. You can return to this link any time within 14 days to make further changes.
        </p>
      </div>
    );
  }

  return (
    <form
      action={handleSubmit}
      className="rounded-lg border p-5 space-y-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ background: `${PALETTE.danger}22`, color: PALETTE.danger }}>
          {error}
        </div>
      )}

      <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
        {isTalent ? 'Artist details' : 'Crew details'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Legal name *" name="legal_name" defaultValue={prefill.legal_name ?? ''} required />
        <FormField
          label={isTalent ? 'Working / stage name' : 'Display name'}
          name="display_name"
          defaultValue={prefill.display_name ?? ''}
        />
        <FormField label="Email *" name="email" type="email" defaultValue={prefill.email ?? ''} required />
        <FormField label="Mobile" name="mobile" type="tel" defaultValue={prefill.mobile ?? ''} />
        {isTalent && <FormField label="Pronouns" name="pronouns" defaultValue={prefill.pronouns ?? ''} placeholder="e.g. she/her" />}
        <FormField label="Date of birth" name="dob" type="date" defaultValue={prefill.dob ?? ''} />
      </div>

      <div>
        <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Home address</label>
        <textarea
          name="home_address"
          defaultValue={prefill.home_address ?? ''}
          rows={2}
          className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
          style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
        />
      </div>

      <h3 className="text-xs font-semibold pt-2" style={{ color: PALETTE.muted }}>Tax & rate</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="ABN" name="abn" defaultValue={prefill.abn ?? ''} placeholder="11 digits" />
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>GST Registered?</label>
          <select
            name="gst_registered"
            defaultValue={String(prefill.gst_registered)}
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <FormField
          label="Default day rate (AUD)"
          name="default_day_rate"
          type="number"
          defaultValue={prefill.default_day_rate != null ? String(prefill.default_day_rate) : ''}
          placeholder="e.g. 1200"
        />
      </div>

      <h3 className="text-xs font-semibold pt-2" style={{ color: PALETTE.muted }}>Superannuation</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Fund name" name="super_fund_name" defaultValue={prefill.super_fund_name ?? ''} />
        <FormField label="Member number" name="super_member_number" defaultValue={prefill.super_member_number ?? ''} />
        <FormField label="USI" name="super_usi" defaultValue={prefill.super_usi ?? ''} />
      </div>

      <p className="text-[10px]" style={{ color: PALETTE.muted }}>
        Banking details are collected separately via Xero. Your information is handled in accordance with Australian Privacy Principles.
      </p>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  name,
  type = 'text',
  required = false,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
        style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
      />
    </div>
  );
}
