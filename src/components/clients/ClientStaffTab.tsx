'use client';

/**
 * Dedicated CRUD table for the client Staff tab.
 *
 * Replaces the inline contacts editor on the main edit form for the
 * common case of "I just want to add/edit/remove a contact" — far less
 * friction than navigating to /edit, scrolling, and saving the whole form.
 *
 * Surfaces the `primary_contact_email` pointer added in migration 0070
 * with a pip on the chosen row plus a "Make primary" action on the others.
 *
 * State management mirrors the proven pattern from ClientEditForm.tsx:172
 * — a local `contacts` array, edits are field-by-field via `updateContact`,
 * save calls a dedicated server action so the rest of the client record
 * stays untouched.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientStaffAction } from '@/app/actions/entities';
import type { ClientContact } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';

type Props = {
  clientId: string;
  initialContacts: ClientContact[];
  initialPrimaryEmail: string | null;
};

const EMPTY_CONTACT: ClientContact = { name: '', role: '', email: '', phone: '', brands: [] };

export default function ClientStaffTab({ clientId, initialContacts, initialPrimaryEmail }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(initialPrimaryEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);

  function addContact() {
    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }]);
  }

  function removeContact(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateContact(idx: number, field: keyof ClientContact, value: string) {
    setContacts((prev) => prev.map((c, i) => {
      if (i !== idx) return c;
      if (field === 'brands') {
        return { ...c, brands: value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [] };
      }
      return { ...c, [field]: value };
    }));
  }

  function makePrimary(email: string | undefined) {
    if (!email) return;
    setPrimaryEmail(email);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSavedTick(false);
    const result = await updateClientStaffAction(clientId, {
      contacts: contacts.map((c) => ({
        name: c.name,
        role: c.role,
        email: c.email,
        phone: c.phone,
        brands: c.brands,
      })),
      primary_contact_email: primaryEmail,
    });
    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    setSavedTick(true);
    router.refresh();
    setTimeout(() => setSavedTick(false), 2000);
  }

  const inputStyle = {
    background: PALETTE.bg,
    color: PALETTE.text,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: 6,
    padding: '5px 8px',
    fontSize: 12,
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
    marginBottom: 2,
  };

  return (
    <section className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="section-title">Staff &amp; Contacts</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            In-house producers, brand managers, accounts. Pick a primary so the booking team knows who to chase.
          </p>
        </div>
        <button
          type="button"
          onClick={addContact}
          className="rounded px-3 py-1 text-xs font-medium"
          style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33`, cursor: 'pointer' }}
        >
          + Add Staff
        </button>
      </div>

      {contacts.length === 0 && (
        <p className="text-[11px] italic" style={{ color: PALETTE.muted }}>
          No additional contacts yet. Click + Add Staff to add one.
        </p>
      )}

      {contacts.map((contact, idx) => {
        const isPrimary = !!contact.email && contact.email === primaryEmail;
        return (
          <div
            key={idx}
            className="rounded-md border p-3 space-y-2"
            style={{
              borderColor: isPrimary ? PALETTE.accent : PALETTE.border,
              background: PALETTE.bg,
              borderWidth: isPrimary ? 2 : 1,
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                  Contact {idx + 1}
                </span>
                {isPrimary && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${PALETTE.accent}22`, color: PALETTE.accent }}
                  >
                    Primary
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isPrimary && contact.email && (
                  <button
                    type="button"
                    onClick={() => makePrimary(contact.email)}
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{ color: PALETTE.accent, background: `${PALETTE.accent}10`, border: `1px solid ${PALETTE.accent}33`, cursor: 'pointer' }}
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeContact(idx)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ color: PALETTE.danger, background: `${PALETTE.danger}15`, border: `1px solid ${PALETTE.danger}30`, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label style={labelStyle}>Name *</label>
                <input
                  value={contact.name}
                  onChange={(e) => updateContact(idx, 'name', e.target.value)}
                  style={inputStyle}
                  placeholder="Sam Davies"
                />
              </div>
              <div>
                <label style={labelStyle}>Role / Title</label>
                <input
                  value={contact.role ?? ''}
                  onChange={(e) => updateContact(idx, 'role', e.target.value)}
                  style={inputStyle}
                  placeholder="Head of Production"
                />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={contact.email ?? ''}
                  onChange={(e) => updateContact(idx, 'email', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  value={contact.phone ?? ''}
                  onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Brands / Accounts (comma-separated)</label>
              <input
                value={(contact.brands ?? []).join(', ')}
                onChange={(e) => updateContact(idx, 'brands', e.target.value)}
                style={inputStyle}
                placeholder="e.g. AJE, Aje Athletica, Resort 26"
              />
            </div>
          </div>
        );
      })}

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded px-4 py-1.5 text-xs font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Staff'}
        </button>
        {savedTick && (
          <span className="text-[11px]" style={{ color: PALETTE.success }}>Saved.</span>
        )}
      </div>
    </section>
  );
}
