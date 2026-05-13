'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/layout/ThemeToggle';

type Props = {
  title: string;
  /** Override auto-inferred back link. Useful when the parent isn't the URL parent. */
  backHref?: string;
  backLabel?: string;
};

const SECTION_LABELS: Record<string, string> = {
  bookings: 'Bookings',
  talent: 'Talent',
  crew: 'Crew',
  clients: 'Clients',
  inbox: 'Inbox',
  reports: 'Reports',
  costs: 'Costs',
  audit: 'Audit',
  settings: 'Settings',
};

function inferBackLink(pathname: string): { href: string; label: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  if (segments.length === 2) {
    const parent = segments[0];
    return { href: `/${parent}`, label: SECTION_LABELS[parent] ?? parent };
  }

  if (segments.length === 3 && segments[2] === 'edit') {
    const sectionLabel = SECTION_LABELS[segments[0]] ?? segments[0];
    return { href: `/${segments[0]}/${segments[1]}`, label: sectionLabel.replace(/s$/, '') };
  }

  return null;
}

export default function Topbar({ title, backHref, backLabel }: Props) {
  const pathname = usePathname();
  const inferred = inferBackLink(pathname);
  const back = backHref && backLabel
    ? { href: backHref, label: backLabel }
    : inferred;

  return (
    <header
      className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"
      style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
    >
      {back && (
        <Link
          href={back.href}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors"
          style={{ color: 'var(--p-muted)' }}
        >
          <span aria-hidden>←</span>
          <span>{back.label}</span>
        </Link>
      )}
      <h1
        className="flex-1 truncate text-sm font-medium"
        style={{ color: 'var(--p-text)' }}
      >
        {title}
      </h1>
      <ThemeToggle />
    </header>
  );
}
