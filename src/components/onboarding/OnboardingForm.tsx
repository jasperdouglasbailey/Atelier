'use client';

import { useState } from 'react';
import { PALETTE, CREW_ROLES } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';

type PersonType = 'talent' | 'crew';
type Step = 'type' | 'details' | 'banking' | 'done';

export default function OnboardingForm() {
  const [personType, setPersonType] = useState<PersonType | null>(null);
  const [step, setStep] = useState<Step>('type');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: personType,
          legal_name: formData.get('legal_name'),
          working_name: formData.get('working_name') || undefined,
          email: formData.get('email'),
          mobile: formData.get('mobile') || undefined,
          pronouns: formData.get('pronouns') || undefined,
          abn: formData.get('abn') || undefined,
          gst_registered: formData.get('gst_registered') === 'true',
          // Crew-specific
          primary_role: formData.get('primary_role') || undefined,
          // Super
          super_fund_name: formData.get('super_fund_name') || undefined,
          super_member_number: formData.get('super_member_number') || undefined,
          super_usi: formData.get('super_usi') || undefined,
          // Talent extras
          instagram: formData.get('instagram') || undefined,
          website: formData.get('website') || undefined,
          emergency_name: formData.get('emergency_name') || undefined,
          emergency_relationship: formData.get('emergency_relationship') || undefined,
          emergency_mobile: formData.get('emergency_mobile') || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Submission failed');
      } else {
        setStep('done');
      }
    } catch {
      setError('Network error — please try again');
    }
    setBusy(false);
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border p-8 text-center" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="text-3xl mb-3">✓</div>
        <h2 className="text-lg font-semibold" style={{ color: PALETTE.text }}>All done</h2>
        <p className="mt-2 text-sm" style={{ color: PALETTE.muted }}>
          Your details have been submitted to Saunders & Co. We&apos;ll be in touch.
          Banking details will be collected securely via Xero — you&apos;ll get a separate invite for that.
        </p>
      </div>
    );
  }

  if (step === 'type') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-center mb-4" style={{ color: PALETTE.muted }}>
          Welcome! Please select your role to get started.
        </p>
        <button
          onClick={() => { setPersonType('talent'); setStep('details'); }}
          className="w-full rounded-lg border p-4 text-left transition hover:border-opacity-100"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.text }}
        >
          <div className="text-sm font-semibold">Artist / Talent</div>
          <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>Models, artists, talent represented by Saunders & Co</div>
        </button>
        <button
          onClick={() => { setPersonType('crew'); setStep('details'); }}
          className="w-full rounded-lg border p-4 text-left transition hover:border-opacity-100"
          style={{ background: PALETTE.surface, borderColor: PALETTE.border, color: PALETTE.text }}
        >
          <div className="text-sm font-semibold">Crew</div>
          <div className="text-xs mt-0.5" style={{ color: PALETTE.muted }}>Photographers, digital ops, stylists, HMUA, producers, etc.</div>
        </button>
      </div>
    );
  }

  const isTalent = personType === 'talent';

  return (
    <form
      action={handleSubmit}
      className="rounded-lg border p-5 space-y-4"
      style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
    >
      <h2 className="text-sm font-semibold" style={{ color: PALETTE.text }}>
        {isTalent ? 'Artist Details' : 'Crew Details'}
      </h2>

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ background: `${PALETTE.danger}22`, color: PALETTE.danger }}>
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Legal Name *" name="legal_name" required />
        {isTalent && <FormField label="Working / Stage Name" name="working_name" />}
        <FormField label="Email *" name="email" type="email" required />
        <FormField label="Mobile" name="mobile" type="tel" />
        <FormField label="Pronouns" name="pronouns" placeholder="e.g. she/her" />
        <FormField label="ABN" name="abn" placeholder="11 digits" />
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>GST Registered?</label>
          <select
            name="gst_registered"
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
      </div>

      {!isTalent && (
        <div>
          <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>Primary Role</label>
          <select
            name="primary_role"
            className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
            style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
          >
            <option value="">Select...</option>
            {CREW_ROLES.map(r => (
              <option key={r} value={r}>{humanise(r)}</option>
            ))}
          </select>
        </div>
      )}

      {isTalent && (
        <>
          <h3 className="text-xs font-semibold pt-2" style={{ color: PALETTE.muted }}>Socials</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Instagram" name="instagram" placeholder="@handle" />
            <FormField label="Website" name="website" type="url" placeholder="https://" />
          </div>

          <h3 className="text-xs font-semibold pt-2" style={{ color: PALETTE.muted }}>Emergency Contact</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Name" name="emergency_name" />
            <FormField label="Relationship" name="emergency_relationship" />
            <FormField label="Mobile" name="emergency_mobile" type="tel" />
          </div>
        </>
      )}

      <h3 className="text-xs font-semibold pt-2" style={{ color: PALETTE.muted }}>Superannuation</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Fund Name" name="super_fund_name" />
        <FormField label="Member Number" name="super_member_number" />
        <FormField label="USI" name="super_usi" />
      </div>

      <p className="text-[10px]" style={{ color: PALETTE.muted }}>
        Banking details are collected securely via Xero — you&apos;ll receive a separate invitation.
        Your information is handled in accordance with Australian Privacy Principles.
      </p>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          {busy ? 'Submitting...' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={() => { setStep('type'); setPersonType(null); }}
          className="rounded px-4 py-2 text-xs font-medium"
          style={{ color: PALETTE.muted }}
        >
          Back
        </button>
      </div>
    </form>
  );
}

function FormField({ label, name, type = 'text', required = false, placeholder }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase" style={{ color: PALETTE.muted }}>{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-0.5 w-full rounded border px-2 py-1.5 text-xs"
        style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
      />
    </div>
  );
}
