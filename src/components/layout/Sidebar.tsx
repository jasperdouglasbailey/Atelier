'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signOutAction } from '@/app/actions/auth';

type NavItem = { label: string; href: string; badge?: number };
type NavSection = { title?: string; items: NavItem[] };
type Props = { inboxCount?: number; userEmail?: string | null };

function NavInner({
  sections,
  userEmail,
  pathname,
}: {
  sections: NavSection[];
  userEmail: string | null;
  pathname: string;
}) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-6' : ''}>
            {section.title && (
              <div
                className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--p-muted)' }}
              >
                {section.title}
              </div>
            )}
            <ul className="space-y-1">
              {section.items.map(({ label, href, badge }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors"
                      style={{
                        color: active ? 'var(--p-text)' : 'var(--p-muted)',
                        background: active ? 'var(--p-border)' : 'transparent',
                      }}
                    >
                      <span>{label}</span>
                      {badge != null && badge > 0 && (
                        <span
                          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                          style={{ background: 'var(--p-accent)', color: 'var(--p-bg)', minWidth: 18, textAlign: 'center' }}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {userEmail && (
        <form
          action={signOutAction}
          className="border-t px-3 py-3"
          style={{ borderColor: 'var(--p-border)' }}
        >
          <div
            className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest truncate"
            style={{ color: 'var(--p-muted)' }}
            title={userEmail}
          >
            {userEmail}
          </div>
          <button
            type="submit"
            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
            style={{ color: 'var(--p-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </form>
      )}
    </>
  );
}

export default function Sidebar({ inboxCount = 0, userEmail = null }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer whenever the user navigates to a new page
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard', href: '/' },
        { label: 'Inbox', href: '/inbox', badge: inboxCount },
        { label: 'Bookings', href: '/bookings' },
        { label: 'Talent', href: '/talent' },
        { label: 'Crew', href: '/crew' },
        { label: 'Clients', href: '/clients' },
        { label: 'Locations', href: '/locations' },
        { label: 'Grid Planner', href: '/grid-planner' },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { label: 'Reports', href: '/reports' },
        { label: 'Costs', href: '/costs' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Compliance', href: '/settings/compliance' },
        { label: 'Renewals', href: '/settings/business-renewals' },
        { label: 'Audit', href: '/audit' },
        { label: 'Settings', href: '/settings' },
      ],
    },
  ];

  return (
    <>
      {/* ── DESKTOP sidebar ─────────────────────────────────────────── */}
      <aside
        className="hidden h-screen w-56 flex-col border-r md:flex flex-shrink-0"
        style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
      >
        <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: 'var(--p-border)' }}>
          <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--p-accent)' }}>
            Atelier
          </span>
        </div>
        <NavInner sections={sections} userEmail={userEmail} pathname={pathname} />
      </aside>

      {/* ── MOBILE header bar ───────────────────────────────────────── */}
      <div
        className="flex md:hidden h-12 flex-shrink-0 items-center justify-between border-b px-4"
        style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
      >
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--p-accent)' }}>
          Atelier
        </span>
        <div className="flex items-center gap-3">
          {inboxCount > 0 && (
            <Link
              href="/inbox"
              className="relative flex items-center justify-center rounded-full w-7 h-7 text-[11px] font-semibold"
              style={{ background: 'var(--p-accent)', color: 'var(--p-bg)' }}
              aria-label={`Inbox — ${inboxCount} pending`}
            >
              {inboxCount > 9 ? '9+' : inboxCount}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex flex-col items-center justify-center w-8 h-8 rounded-md gap-1.5"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span className="block w-5 h-px" style={{ background: 'var(--p-muted)' }} />
            <span className="block w-5 h-px" style={{ background: 'var(--p-muted)' }} />
            <span className="block w-5 h-px" style={{ background: 'var(--p-muted)' }} />
          </button>
        </div>
      </div>

      {/* ── MOBILE drawer overlay ───────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <aside
            className="absolute left-0 top-0 bottom-0 flex w-72 flex-col"
            style={{
              background: 'var(--p-surface)',
              borderRight: '1px solid var(--p-border)',
            }}
          >
            <div
              className="flex h-14 items-center justify-between border-b px-5"
              style={{ borderColor: 'var(--p-border)' }}
            >
              <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--p-accent)' }}>
                Atelier
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="flex items-center justify-center w-8 h-8 rounded-md text-lg"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--p-muted)' }}
              >
                ✕
              </button>
            </div>
            <NavInner sections={sections} userEmail={userEmail} pathname={pathname} />
          </aside>
        </div>
      )}
    </>
  );
}
