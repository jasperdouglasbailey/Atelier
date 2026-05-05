/**
 * Partner & user roles management — Phase 5 admin surface.
 *
 * Lists all atelier_app_users rows. Owner can provision new partner /
 * talent / crew accounts here. Talent and crew accounts will become
 * useful when the Phase 6 portals ship; until then partner accounts
 * (Jemma Williams, Gary Saunders) are the immediate value.
 */

import Topbar from '@/components/layout/Topbar';
import { listAppUsers, getCurrentAppUser } from '@/lib/data/app-users';
import { listTalent, listCrew } from '@/lib/data/entities';
import { PALETTE } from '@/lib/utils/constants';
import PartnerAccountsPanel from '@/components/settings/PartnerAccountsPanel';

export const dynamic = 'force-dynamic';

export default async function PartnersSettingsPage() {
  const [users, currentUser, talent, crew] = await Promise.all([
    listAppUsers(),
    getCurrentAppUser(),
    listTalent(),
    listCrew(),
  ]);

  return (
    <>
      <Topbar title="Partner & user roles" />
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-xs max-w-2xl" style={{ color: PALETTE.muted }}>
          Provision <strong>partner</strong> accounts (Jemma Williams, Gary Saunders) for
          full owner-level access, or pre-link <strong>talent</strong> and <strong>crew</strong> users
          to their domain records ahead of the Phase 6 portals. The user must sign in via
          the magic-link login flow once before they appear in auth.users — only then can
          you provision their role here.
        </p>
        <PartnerAccountsPanel
          users={users}
          currentUserId={currentUser?.user_id ?? null}
          talent={talent.map((t) => ({ id: t.id, label: t.working_name }))}
          crew={crew.map((c) => ({ id: c.id, label: c.name }))}
        />
      </div>
    </>
  );
}
