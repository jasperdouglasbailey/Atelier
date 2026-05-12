'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCrewAction } from '@/app/actions/entities';
import { PALETTE, CREW_ROLES, PREFERRED_COMMS_OPTIONS, PREFERRED_COMMS_LABELS } from '@/lib/utils/constants';
import { humanise } from '@/lib/utils/humanise';
import type { Crew } from '@/lib/types/database';

type Props = { crew: Crew };

const TIER_OPTIONS = [
  { value: 'preferred_core', label: 'Preferred Core' },
  { value: 'regular_freelance', label: 'Regular Freelance' },
  { value: 'never_again', label: 'Never Again' },
];

// Common AU + international cities Jasper books from. Free-text fallback.
const COMMON_CITIES = [
  'Sydney', 'Melbourne', 'Byron Bay/Gold Coast', 'Brisbane', 'Adelaide', 'Perth',
  'Paris', 'London', 'New York', 'Los Angeles',
];

export default function CrewEditForm({ crew }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const result = await updateCrewAction(crew.id, fd);

    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.push(`/crew/${crew.id}`);
    router.refresh();
  }

  const inputStyle = {
    background: PALETTE.bg,
    borderColor: PALETTE.border,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    width: '100%',
    outline: 'none',
  };

  const labelStyle = {
    color: PALETTE.muted,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: 4,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Basic Information</h3>

        <div>
          <label style={labelStyle}>Name *</label>
          <input name="name" required defaultValue={crew.name} style={inputStyle} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>Primary Role</label>
            <select name="primary_role" defaultValue={crew.primary_role ?? ''} style={inputStyle}>
              <option value="">— Select —</option>
              {CREW_ROLES.map((r) => (
                <option key={r} value={r}>{humanise(r)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tier</label>
            <select name="tier" defaultValue={crew.tier} style={inputStyle}>
              {TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>City / Home Base</label>
            <input
              name="city"
              defaultValue={crew.city ?? ''}
              list="crew-cities"
              style={inputStyle}
              placeholder="Sydney, Melbourne, …"
            />
            <datalist id="crew-cities">
              {COMMON_CITIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>

        {/* Secondary roles — tick all that apply. Stored as string[]. The primary
            role is the one shown on bookings; secondary roles display as
            "Primary / Secondary / Secondary" throughout the platform. */}
        <div>
          <label style={labelStyle}>Additional Roles</label>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {CREW_ROLES.filter((r) => r !== (crew.primary_role ?? '')).map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: PALETTE.text }}>
                <input
                  type="checkbox"
                  name="secondary_roles"
                  value={r}
                  defaultChecked={(crew.secondary_roles ?? []).includes(r)}
                  style={{ accentColor: PALETTE.accent }}
                />
                {humanise(r)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px]" style={{ color: PALETTE.muted }}>
            Shown as &ldquo;Primary / Additional&rdquo; e.g. &ldquo;Digital Operator / Assistant&rdquo;
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Contact</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" defaultValue={crew.email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Mobile</label>
            <input name="mobile" defaultValue={crew.mobile ?? ''} style={inputStyle} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Preferred Comms</label>
            <select name="preferred_comms" defaultValue={crew.preferred_comms ?? ''} style={inputStyle}>
              <option value="">— Not set —</option>
              {PREFERRED_COMMS_OPTIONS.map((c) => (
                <option key={c} value={c}>{PREFERRED_COMMS_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Date of Birth</label>
            <input name="dob" type="date" defaultValue={crew.dob ?? ''} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Home Address</label>
          <input name="home_address" defaultValue={crew.home_address ?? ''} style={inputStyle} placeholder="Unit / street, suburb, postcode" />
        </div>
      </section>

      {/* Call sheet — Dietary + Drink */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Call Sheet Preferences</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Dietary Requirements</label>
            <input name="dietary" defaultValue={crew.dietary ?? ''} style={inputStyle} placeholder="NIL, GF & DF, no chicken, …" />
          </div>
          <div>
            <label style={labelStyle}>Drink Order</label>
            <input name="drink_order" defaultValue={crew.drink_order ?? ''} style={inputStyle} placeholder="Long black, oat cap, …" />
          </div>
        </div>
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          These appear on the crew call sheet sent to clients.
        </p>
      </section>

      {/* Business / Finance */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Business & Finance</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>ABN</label>
            <input name="abn" defaultValue={crew.abn ?? ''} style={inputStyle} placeholder="XX XXX XXX XXX" />
          </div>
          <div>
            <label style={labelStyle}>GST Registered</label>
            <select name="gst_registered" defaultValue={crew.gst_registered ? 'true' : 'false'} style={inputStyle}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Default Day Rate (AUD)</label>
            <input name="default_day_rate" type="number" min={0} step={50} defaultValue={crew.default_day_rate ?? ''} style={inputStyle} placeholder="e.g. 800" />
          </div>
          <div>
            <label style={labelStyle}>Min Day Rate (AUD)</label>
            <input name="min_day_rate" type="number" min={0} step={50} defaultValue={crew.min_day_rate ?? ''} style={inputStyle} placeholder="e.g. 600" />
          </div>
          <div>
            <label style={labelStyle}>Max Day Rate (AUD)</label>
            <input name="max_day_rate" type="number" min={0} step={50} defaultValue={crew.max_day_rate ?? ''} style={inputStyle} placeholder="e.g. 1000" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Xero Contact ID</label>
            <input name="xero_contact_id" defaultValue={crew.xero_contact_id ?? ''} style={inputStyle} placeholder="UUID from Xero" />
          </div>
          <div>
            <label style={labelStyle}>Bank Setup in Xero</label>
            <select name="bank_setup_in_xero" defaultValue={crew.bank_setup_in_xero ? 'true' : 'false'} style={inputStyle}>
              <option value="false">No</option>
              <option value="true">Yes</option>
            </select>
          </div>
        </div>
      </section>

      {/* Bank Account */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Bank Account</h3>
        <p style={{ fontSize: 10, color: PALETTE.muted }}>Used for RCTI / remittance payments. Owner-visible only.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>Account Name</label>
            <input name="bank_account_name" defaultValue={crew.bank_account_name ?? ''} style={inputStyle} placeholder="As on bank account" />
          </div>
          <div>
            <label style={labelStyle}>BSB</label>
            <input name="bank_bsb" defaultValue={crew.bank_bsb ?? ''} style={inputStyle} placeholder="XXX-XXX" />
          </div>
          <div>
            <label style={labelStyle}>Account Number</label>
            <input name="bank_account_number" defaultValue={crew.bank_account_number ?? ''} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* Super */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Superannuation</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label style={labelStyle}>Fund Name</label>
            <input name="super_fund_name" defaultValue={crew.super_fund_name ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Member Number</label>
            <input name="super_member_number" defaultValue={crew.super_member_number ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>USI</label>
            <input name="super_usi" defaultValue={crew.super_usi ?? ''} style={inputStyle} />
          </div>
        </div>
      </section>

      {/* Equipment + certifications */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Equipment & Certifications</h3>

        <div>
          <label style={labelStyle}>Kit List</label>
          <textarea
            name="kit_list"
            defaultValue={crew.kit_list ?? ''}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="e.g. Sony FX6 + 24-70 GM, 2x Aputure 600d, DJI RS3 Pro"
          />
        </div>
        <div>
          <label style={labelStyle}>Certifications (comma separated)</label>
          <input
            name="certifications"
            defaultValue={(crew.certifications ?? []).join(', ')}
            style={inputStyle}
            placeholder="e.g. White Card, RPL drone, RSA"
          />
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
        <textarea
          name="notes"
          defaultValue={crew.notes ?? ''}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Internal notes about this crew member…"
        />
      </section>

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}>
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded px-5 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/crew/${crew.id}`)}
          className="rounded px-5 py-2 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
