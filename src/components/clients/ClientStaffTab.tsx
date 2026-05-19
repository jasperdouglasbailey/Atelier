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
 * UX policy:
 * - **Autosave** (debounced 1.5s) for parity with the main edit form,
 *   which uses `useAutoSave`. The Staff tab manages contacts as React
 *   state rather than a form, so we run a state-driven debounce here
 *   instead of reusing the form-based hook directly. Same SaveIndicator
 *   visual.
 * - **Click-to-confirm Remove** — first click flips the button to
 *   "Confirm?" for 3s; second click within that window deletes. Prevents
 *   one-click data loss on a phone number you just finished typing.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientStaffAction } from '@/app/actions/entities';
import type { ClientContact } from '@/lib/types/database';
import { PALETTE } from '@/lib/utils/constants';
import SaveIndicator from '@/components/ui/SaveIndicator';
import type { SaveStatus } from '@/lib/hooks/useAutoSave';

type Props = {
  clientId: string;
  initialContacts: ClientContact[];
  initialPrimaryEmail: string | null;
};

const EMPTY_CONTACT: ClientContact = { name: '', role: '', email: '', phone: '', brands: [] };
const AUTOSAVE_DEBOUNCE_MS = 1500;
const REMOVE_CONFIRM_TIMEOUT_MS = 3000;

export default function ClientStaffTab({ clientId, initialContacts, initialPrimaryEmail }: Props) {
  const router = useRouter();
  const [contacts, setContacts] = useState<ClientContact[]>(initialContacts);
  const [primaryEmail, setPrimaryEmail] = useState<string | null>(initialPrimaryEmail);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null);

  // Skip the autosave fire on initial mount so we don't write back the
  // server-rendered values verbatim. `dirtyRef` flips on the first user
  // edit and stays true for the lifetime of the component.
  const dirtyRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedTickRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep a live ref to the latest state so the debounced closure sees the
  // freshest values without re-binding on every render.
  const latestRef = useRef({ contacts, primaryEmail });
  useEffect(() => {
    latestRef.current = { contacts, primaryEmail };
  });

  // Debounced autosave on every edit. We can't reuse `useAutoSave` directly
  // because that hook is wired to form change events; our editor is state-
  // driven (contacts as useState array). Same 1500ms debounce + SaveIndicator
  // visuals so the two surfaces feel identical.
  useEffect(() => {
    if (!dirtyRef.current) return;
    clearTimeout(debounceRef.current);
    clearTimeout(savedTickRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      const { contacts: c, primaryEmail: p } = latestRef.current;
      const result = await updateClientStaffAction(clientId, {
        contacts: c.map((row) => ({
          name: row.name,
          role: row.role,
          email: row.email,
          phone: row.phone,
          brands: row.brands,
        })),
        primary_contact_email: p,
      });
      if ('error' in result && result.error) {
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      router.refresh();
      savedTickRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [contacts, primaryEmail, clientId, router]);

  // Cleanup on unmount.
  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    clearTimeout(savedTickRef.current);
  }, []);

  function markDirty() {
    dirtyRef.current = true;
  }

  function addContact() {
    markDirty();
    setContacts((prev) => [...prev, { ...EMPTY_CONTACT }]);
  }

  function attemptRemove(idx: number) {
    // Two-stage click. First click arms the row; second click within the
    // timeout removes. Re-clicking a different row resets the arm.
    if (pendingRemoveIdx !== idx) {
      setPendingRemoveIdx(idx);
      // Clear the armed state after the timeout if no second click came.
      window.setTimeout(() => {
        setPendingRemoveIdx((current) => (current === idx ? null : current));
      }, REMOVE_CONFIRM_TIMEOUT_MS);
      return;
    }
    markDirty();
    setContacts((prev) => prev.filter((_, i) => i !== idx));
    setPendingRemoveIdx(null);
  }

  function updateContact(idx: number, field: keyof ClientContact, value: string) {
    markDirty();
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
    markDirty();
    setPrimaryEmail(email);
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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="section-title">Staff &amp; Contacts</h3>
          <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
            In-house producers, brand managers, accounts. Pick a primary so the booking team knows who to chase. Saves automatically.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <SaveIndicator status={saveStatus} />
          <button
            type="button"
            onClick={addContact}
            className="rounded px-3 py-1 text-xs font-medium"
            style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33`, cursor: 'pointer' }}
          >
            + Add Staff
          </button>
        </div>
      </div>

      {contacts.length === 0 && (
        <p className="text-[11px] italic" style={{ color: PALETTE.muted }}>
          No additional contacts yet. Click + Add Staff to add one.
        </p>
      )}

      {contacts.map((contact, idx) => {
        const isPrimary = !!contact.email && contact.email === primaryEmail;
        const isPendingRemove = pendingRemoveIdx === idx;
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
                  onClick={() => attemptRemove(idx)}
                  className="text-[10px] px-2 py-0.5 rounded transition-colors"
                  style={{
                    color: isPendingRemove ? PALETTE.bg : PALETTE.danger,
                    background: isPendingRemove ? PALETTE.danger : `${PALETTE.danger}15`,
                    border: `1px solid ${isPendingRemove ? PALETTE.danger : `${PALETTE.danger}30`}`,
                    cursor: 'pointer',
                    minWidth: isPendingRemove ? 92 : undefined,
                  }}
                  aria-label={isPendingRemove ? 'Confirm remove contact' : 'Remove contact'}
                >
                  {isPendingRemove ? 'Click to confirm' : 'Remove'}
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
    </section>
  );
}
