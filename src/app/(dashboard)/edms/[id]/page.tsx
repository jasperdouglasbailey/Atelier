import { notFound } from 'next/navigation';
import Link from 'next/link';
import Topbar from '@/components/layout/Topbar';
import EdmEditor from '@/components/edms/EdmEditor';
import { getEdm } from '@/lib/data/edms';
import { EDM_TEMPLATE_LABELS } from '@/lib/edms/templates';
import { checkGoogleTokenValid } from '@/lib/integrations/google-auth';
import { PALETTE } from '@/lib/utils/constants';

export default async function EdmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [edm, googleStatus] = await Promise.all([
    getEdm(id),
    checkGoogleTokenValid(),
  ]);
  if (!edm) notFound();

  const googleConnected = googleStatus === 'connected';

  return (
    <>
      <Topbar title={edm.title} />
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/edms"
            className="text-xs"
            style={{ color: PALETTE.muted }}
          >
            ← All EDMs
          </Link>
          <div className="flex items-center gap-3 text-xs" style={{ color: PALETTE.muted }}>
            <span>{EDM_TEMPLATE_LABELS[edm.template]}</span>
            <span>·</span>
            <span style={{ color: edm.status === 'sent' ? PALETTE.ok : PALETTE.muted }}>
              {edm.status}
            </span>
          </div>
        </div>

        {!googleConnected && (
          <div
            className="mb-4 rounded-md border p-3 text-xs"
            style={{ borderColor: PALETTE.warn, color: PALETTE.warn, background: PALETTE.warnBg }}
          >
            Google isn&apos;t connected. You can build and preview the EDM, but creating a Gmail draft requires
            reconnecting in <Link href="/settings" style={{ textDecoration: 'underline' }}>Settings</Link>.
            The Drive image picker also needs the new <code>drive.readonly</code> scope — reconnect to grant it.
          </div>
        )}

        <EdmEditor edm={edm} googleConnected={googleConnected} />
      </div>
    </>
  );
}
