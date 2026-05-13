'use client';

import { useState } from 'react';
import { PALETTE } from '@/lib/utils/constants';
import {
  provisionAppUserAction,
  toggleAppUserActiveAction,
  deleteAppUserAction,
} from '@/app/actions/app-users';
import type { AppUser, AppRole } from '@/lib/data/app-users';

type Props = {
  users: AppUser[];
  currentUserId: string | null;
  talent: Array<{ id: string; label: string }>;
  crew: Array<{ id: string; label: string }>;
};

const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'Owner',
  partner: 'Partner',
  talent: 'Talent',
  crew: 'Crew',
};

const ROLE_COLORS: Record<AppRole, string> = {
  owner: PALETTE.accent,
  partner: PALETTE.success,
  talent: PALETTE.warning,
  crew: PALETTE.muted,
};

export default function PartnerAccountsPanel({ users, currentUserId, talent, crew }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  // New-user form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('partner');
  const [displayName, setDisplayName] = useState('');
  const [talentId, setTalentId] = useState('');
  const [crewId, setCrewId] = useState('');

  async function onProvision() {
    setBusy(true);
    setFeedback(null);
    const res = await provisionAppUserAction({
      email,
      role,
      display_name: displayName || undefined,
      talent_id: role === 'talent' ? talentId : undefined,
      crew_id: role === 'crew' ? crewId : undefined,
    });
    if (res.ok) {
      setFeedback({ kind: 'ok', msg: `Provisioned ${role} account for ${email}.` });
      setEmail('');
      setDisplayName('');
      setTalentId('');
      setCrewId('');
    } else {
      setFeedback({ kind: 'error', msg: res.error });
    }
    setBusy(false);
  }

  async function onToggleActive(userId: string, currentlyActive: boolean) {
    setBusy(true);
    const res = await toggleAppUserActiveAction(userId, !currentlyActive);
    if (!res.ok) setFeedback({ kind: 'error', msg: res.error });
    setBusy(false);
  }

  async function onDelete(userId: string) {
    if (!confirm('Permanently remove this user role? They keep their auth account but lose Atelier access.')) return;
    setBusy(true);
    const res = await deleteAppUserAction(userId);
    if (!res.ok) setFeedback({ kind: 'error', msg: res.error });
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {/* Provision form */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="section-title mb-3">
          Provision a new account
        </h2>

        {feedback && (
          <div
            className="mb-3 rounded px-3 py-2 text-xs"
            style={{
              background: feedback.kind === 'ok' ? `${PALETTE.success}22` : `${PALETTE.danger}22`,
              color: feedback.kind === 'ok' ? PALETTE.success : PALETTE.danger,
            }}
          >
            {feedback.msg}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email *">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jemma@saundersandco.com.au"
              className="w-full rounded border px-2 py-1.5 text-xs"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </Field>
          <Field label="Display name">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jemma Williams"
              className="w-full rounded border px-2 py-1.5 text-xs"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
            />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="w-full rounded border px-2 py-1.5 text-xs"
              style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
            >
              <option value="partner">Partner — full owner-level access</option>
              <option value="talent">Talent — portal access (Phase 6)</option>
              <option value="crew">Crew — portal access (Phase 6)</option>
            </select>
          </Field>

          {role === 'talent' && (
            <Field label="Linked talent record *">
              <select
                value={talentId}
                onChange={(e) => setTalentId(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              >
                <option value="">Select…</option>
                {talent.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
          )}

          {role === 'crew' && (
            <Field label="Linked crew record *">
              <select
                value={crewId}
                onChange={(e) => setCrewId(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-xs"
                style={{ background: PALETTE.bg, borderColor: PALETTE.border, color: PALETTE.text }}
              >
                <option value="">Select…</option>
                {crew.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
          )}
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={onProvision}
            disabled={busy || !email || (role === 'talent' && !talentId) || (role === 'crew' && !crewId)}
            className="rounded px-4 py-2 text-xs font-medium disabled:opacity-50"
            style={{ background: PALETTE.accent, color: PALETTE.bg }}
          >
            {busy ? 'Working…' : 'Provision account'}
          </button>
        </div>
      </section>

      {/* Existing users */}
      <section className="rounded-lg border p-4" style={{ background: PALETTE.surface, borderColor: PALETTE.border }}>
        <h2 className="section-title mb-3">
          Existing accounts ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-xs" style={{ color: PALETTE.muted }}>No accounts provisioned yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: PALETTE.muted, borderBottom: `1px solid ${PALETTE.border}` }}>
                <th className="py-2 text-left">Display name</th>
                <th className="py-2 text-left">Role</th>
                <th className="py-2 text-left">Linked entity</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.user_id === currentUserId;
                return (
                  <tr key={u.user_id} style={{ borderBottom: `1px solid ${PALETTE.border}` }}>
                    <td className="py-2">{u.display_name ?? '—'}{isMe && <span style={{ color: PALETTE.muted }}> (you)</span>}</td>
                    <td className="py-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role] }}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="py-2 font-mono text-[10px]" style={{ color: PALETTE.muted }}>
                      {u.talent_id ? `talent:${u.talent_id.slice(0, 8)}` : u.crew_id ? `crew:${u.crew_id.slice(0, 8)}` : '—'}
                    </td>
                    <td className="py-2">{u.is_active ? 'Active' : 'Disabled'}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onToggleActive(u.user_id, u.is_active)}
                        disabled={busy || isMe}
                        className="text-[11px] underline mr-3 disabled:opacity-30"
                        style={{ color: PALETTE.muted }}
                      >
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(u.user_id)}
                        disabled={busy || isMe}
                        className="text-[11px] underline disabled:opacity-30"
                        style={{ color: PALETTE.danger }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase mb-1" style={{ color: PALETTE.muted }}>
        {label}
      </label>
      {children}
    </div>
  );
}
