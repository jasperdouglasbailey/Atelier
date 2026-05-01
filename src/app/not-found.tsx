import Link from 'next/link';
import { PALETTE } from '@/lib/utils/constants';

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: PALETTE.bg, color: PALETTE.text }}
    >
      <div
        className="max-w-md rounded-lg border p-6 space-y-4 text-center"
        style={{ background: PALETTE.surface, borderColor: PALETTE.border }}
      >
        <div className="text-4xl font-semibold" style={{ color: PALETTE.muted }}>404</div>
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="text-sm" style={{ color: PALETTE.muted }}>
          The booking, client, or page you were looking for doesn&apos;t exist
          or has been removed.
        </p>
        <Link
          href="/"
          className="inline-block rounded px-4 py-2 text-sm font-medium"
          style={{ background: PALETTE.accent, color: PALETTE.bg }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
