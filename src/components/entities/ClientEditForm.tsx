'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateClientAction } from '@/app/actions/entities';
import { PALETTE, PREFERRED_COMMS_OPTIONS, PREFERRED_COMMS_LABELS, COMMUNICATION_STYLE_OPTIONS, COMMUNICATION_STYLE_LABELS } from '@/lib/utils/constants';
import type { Client, ClientContact } from '@/lib/types/database';
import EmailTonePreview from './EmailTonePreview';
import { useAutoSave } from '@/lib/hooks/useAutoSave';
import SaveIndicator from '@/components/ui/SaveIndicator';

type Props = {
  client: Client;
  /**
   * Union of every tag in use across all clients. Drives the click-to-add
   * suggestion chips below the tags input — keeps tag spelling consistent
   * (no `magazine` vs `Magazine` drift) without forcing a chip-input rewrite.
   */
  allTags?: string[];
};

const EMPTY_CONTACT: ClientContact = { name: '', role: '', email: '', phone: '', brands: [] };

export default function ClientEditForm({ client, allTags = [] }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { saveStatus, formRef, handleChange } = useAutoSave(
    (fd) => updateClientAction(client.id, fd),
  );
  const [contacts, setContacts] = useState<ClientContact[]>(
    Array.isArray(client.contacts) && client.contacts.length > 0
      ? client.contacts
      : []
  );
  const [tagsValue, setTagsValue] = useState<string>(
    (client.tags ?? []).join(', '),
  );
  const tagsInputRef = useRef<HTMLInputElement | null>(null);

  // Current tags on this client — used to filter the suggestion chips so
  // we don't suggest something that's already typed.
  const currentTags = useMemo(() => {
    return new Set(
      tagsValue.split(',').map((s) => s.trim()).filter(Boolean),
    );
  }, [tagsValue]);

  function appendTag(tag: string) {
    // Append cleanly: if input ends with empty or already-comma, just add;
    // otherwise add ", tag". Trim trailing comma if user already had one.
    const trimmed = tagsValue.trim().replace(/,\s*$/, '');
    const next = trimmed.length === 0 ? tag : `${trimmed}, ${tag}`;
    setTagsValue(next);
    // Trigger the autosave hook explicitly — programmatic value change
    // doesn't fire a native onChange event.
    handleChange();
    tagsInputRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.set('contacts', JSON.stringify(contacts));
    const result = await updateClientAction(client.id, fd);

    setSaving(false);
    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }
    router.push(`/clients/${client.id}`);
    router.refresh();
  }

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
    <form ref={formRef} onSubmit={handleSubmit} onChange={handleChange} className="space-y-6">
      {/* Basic info */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Basic Information</h3>

        <div>
          <label style={labelStyle}>Name *</label>
          <input
            name="name"
            required
            defaultValue={client.name}
            style={inputStyle}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Company</label>
            <input name="company" defaultValue={client.company ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ABN</label>
            <input name="abn" defaultValue={client.abn ?? ''} style={inputStyle} placeholder="XX XXX XXX XXX" />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Type</label>
          <select
            name="is_creative_agency"
            defaultValue={client.is_creative_agency ? 'true' : 'false'}
            style={inputStyle}
          >
            <option value="false">Direct Client</option>
            <option value="true">Creative Agency</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Physical Address</label>
            <input
              name="address_physical"
              defaultValue={client.address_physical ?? client.address ?? ''}
              style={inputStyle}
              placeholder="e.g. Level 5, 100 Harris St, Pyrmont NSW 2009"
            />
          </div>
          <div>
            <label style={labelStyle}>Postal Address</label>
            <input
              name="postal_address"
              defaultValue={client.postal_address ?? ''}
              style={inputStyle}
              placeholder="If different from physical (PO Box, locked bag, etc.)"
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Tags</label>
          <input
            ref={tagsInputRef}
            name="tags"
            value={tagsValue}
            onChange={(e) => setTagsValue(e.target.value)}
            style={inputStyle}
            placeholder="e.g. magazine, agency, fashion (comma-separated)"
          />
          {allTags.length > 0 && allTags.some((t) => !currentTags.has(t)) && (
            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
              <span className="text-[10px]" style={{ color: PALETTE.muted }}>Suggestions:</span>
              {allTags.filter((t) => !currentTags.has(t)).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => appendTag(tag)}
                  className="rounded-full px-2 py-0.5 text-[10px]"
                  style={{
                    background: `${PALETTE.accent}10`,
                    color: PALETTE.accent,
                    border: `1px solid ${PALETTE.accent}33`,
                    cursor: 'pointer',
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Important pinned note — short, always visible on the detail page. */}
      <section className="rounded-lg border p-4 space-y-2" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Important Note</h3>
        <p className="text-[11px]" style={{ color: PALETTE.muted }}>
          Short, always-visible reminder (e.g. &ldquo;Always CC accounts@…&rdquo;). Distinct from the long-form Notes below.
        </p>
        <textarea
          name="important_note"
          defaultValue={client.important_note ?? ''}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Short pinned reminder…"
        />
      </section>

      {/* Primary contact */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Primary Contact</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Email</label>
            <input name="email" type="email" defaultValue={client.email ?? ''} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name="phone" defaultValue={client.phone ?? ''} style={inputStyle} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Preferred Comms</label>
            <select name="preferred_comms" defaultValue={client.preferred_comms ?? ''} style={inputStyle}>
              <option value="">— Not set —</option>
              {PREFERRED_COMMS_OPTIONS.map((c) => (
                <option key={c} value={c}>{PREFERRED_COMMS_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Email Tone</label>
            <select name="communication_style" defaultValue={client.communication_style ?? ''} style={inputStyle}>
              <option value="">— Default (casual) —</option>
              {COMMUNICATION_STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{COMMUNICATION_STYLE_LABELS[s]}</option>
              ))}
            </select>
            <EmailTonePreview
              initialStyle={client.communication_style}
              clientName={client.name}
            />
          </div>
        </div>
      </section>

      {/* Additional contacts */}
      <section className="rounded-lg border p-4 space-y-3" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Additional Contacts</h3>
            <p className="text-[11px] mt-0.5" style={{ color: PALETTE.muted }}>
              In-house producers, brand managers, or other contacts at this client.
            </p>
          </div>
          <button
            type="button"
            onClick={addContact}
            className="rounded px-3 py-1 text-xs font-medium"
            style={{ background: `${PALETTE.accent}18`, color: PALETTE.accent, border: `1px solid ${PALETTE.accent}33` }}
          >
            + Add
          </button>
        </div>

        {contacts.length === 0 && (
          <p className="text-[11px] italic" style={{ color: PALETTE.muted }}>No additional contacts yet.</p>
        )}

        {contacts.map((contact, idx) => (
          <div
            key={idx}
            className="rounded-md border p-3 space-y-2"
            style={{ borderColor: PALETTE.border, background: PALETTE.bg }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.muted }}>
                Contact {idx + 1}
              </span>
              <button
                type="button"
                onClick={() => removeContact(idx)}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ color: PALETTE.danger, background: `${PALETTE.danger}15`, border: `1px solid ${PALETTE.danger}30` }}
              >
                Remove
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Name *</label>
                <input
                  value={contact.name}
                  onChange={(e) => updateContact(idx, 'name', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                  placeholder="Sam Davies"
                  required
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Role / Title</label>
                <input
                  value={contact.role ?? ''}
                  onChange={(e) => updateContact(idx, 'role', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                  placeholder="Head of Production"
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Email</label>
                <input
                  type="email"
                  value={contact.email ?? ''}
                  onChange={(e) => updateContact(idx, 'email', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                />
              </div>
              <div>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Phone</label>
                <input
                  value={contact.phone ?? ''}
                  onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ ...labelStyle, marginBottom: 2 }}>Brands / Accounts (comma-separated)</label>
              <input
                value={(contact.brands ?? []).join(', ')}
                onChange={(e) => updateContact(idx, 'brands', e.target.value)}
                style={{ ...inputStyle, fontSize: 12, padding: '5px 8px' }}
                placeholder="e.g. AJE, Aje Athletica, Resort 26"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Finance — banking lives in Xero ONLY (CLAUDE.md doctrine). We capture
          payment terms here and link out to the Xero contact for the rest. */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Finance</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Payment Terms (days)</label>
            <input
              name="payment_terms_days"
              type="number"
              min={0}
              max={180}
              defaultValue={client.payment_terms_days ?? ''}
              style={{ ...inputStyle, width: 120 }}
              placeholder="30"
            />
          </div>
          <div>
            <label style={labelStyle}>Xero Contact ID</label>
            <input
              name="xero_contact_id"
              defaultValue={client.xero_contact_id ?? ''}
              style={inputStyle}
              placeholder="UUID from go.xero.com → contact URL"
            />
            <p className="text-[10px] mt-1" style={{ color: PALETTE.muted }}>
              Enables a one-click deep-link to the Xero contact. Banking details stay in Xero.
            </p>
          </div>
        </div>
      </section>

      {/* Notes */}
      <section className="rounded-lg border p-4 space-y-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: PALETTE.muted }}>Notes</h3>
        <textarea
          name="notes"
          defaultValue={client.notes ?? ''}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Internal notes about this client…"
        />
      </section>

      {error && (
        <div className="rounded px-3 py-2 text-xs" style={{ color: PALETTE.danger, background: `${PALETTE.danger}15` }}>
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded px-5 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: PALETTE.accent, color: PALETTE.bg, border: 'none', cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <SaveIndicator status={saveStatus} />
        <button
          type="button"
          onClick={() => router.push(`/clients/${client.id}`)}
          className="rounded px-5 py-2 text-sm font-medium"
          style={{ background: 'transparent', color: PALETTE.muted, border: `1px solid ${PALETTE.border}`, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
