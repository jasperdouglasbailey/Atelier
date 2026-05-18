'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signOutAction } from '@/app/actions/auth';
import { useRealtimeInboxCount } from '@/lib/hooks/useRealtimeInboxCount';

type NavItem = { label: string; href: string; badge?: number; num?: string };
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
      <nav className="flex-1 overflow-y-auto py-5 px-4">
        {sections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-7' : ''}>
            {section.title && (
              <div
                className="mb-2 px-2"
                style={{
                  color: 'var(--p-mid-2)',
                  fontFamily: 'var(--font-dm-mono), monospace',
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                }}
              >
                {section.title}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map(({ label, href, badge, num }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center justify-between px-2 py-1.5 transition-colors"
                      style={{
                        color: active ? 'var(--p-text)' : 'var(--p-muted)',
                        background: active ? 'rgba(196,168,130,0.10)' : 'transparent',
                        boxShadow: active ? 'inset 2px 0 0 0 var(--p-accent)' : 'none',
                        borderRadius: active ? '0 3px 3px 0' : 3,
                        fontSize: 13,
                      }}
                    >
                      <span className="flex items-baseline gap-2.5">
                        {num && (
                          <span
                            style={{
                              fontFamily: 'var(--font-dm-mono), monospace',
                              fontSize: 10,
                              color: active ? 'var(--p-muted)' : 'var(--p-border)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {num}
                          </span>
                        )}
                        <span style={{ fontWeight: active ? 500 : 400 }}>{label}</span>
                      </span>
                      {badge != null && badge > 0 && (
                        <span
                          className="ml-auto rounded-full px-1.5 py-0.5 leading-none"
                          style={{
                            background: 'var(--p-bg)',
                            border: '1px solid var(--p-border)',
                            color: 'var(--p-text)',
                            fontFamily: 'var(--font-dm-mono), monospace',
                            fontSize: 10,
                            minWidth: 18,
                            textAlign: 'center',
                          }}
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
          className="border-t px-4 py-3"
          style={{ borderColor: 'var(--p-border)' }}
        >
          <div
            className="mb-1 px-2 truncate"
            style={{
              color: 'var(--p-muted)',
              fontFamily: 'var(--font-dm-mono), monospace',
              fontSize: 10,
              letterSpacing: '0.04em',
            }}
            title={userEmail}
          >
            {userEmail}
          </div>
          <button
            type="submit"
            className="w-full px-2 py-1.5 text-left transition-colors"
            style={{ color: 'var(--p-muted)', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12 }}
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
  const liveInboxCount = useRealtimeInboxCount(inboxCount);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard',    href: '/',             num: '01' },
        { label: 'Inbox',        href: '/inbox',        num: '02', badge: liveInboxCount },
        { label: 'Bookings',     href: '/bookings',     num: '03' },
        { label: 'Talent',       href: '/talent',       num: '04' },
        { label: 'Crew',         href: '/crew',         num: '05' },
        { label: 'Clients',      href: '/clients',      num: '06' },
        { label: 'Locations',    href: '/locations',    num: '07' },
        { label: 'Grid Planner', href: '/grid-planner', num: '08' },
        { label: 'EDMs',         href: '/edms',         num: '09' },
      ],
    },
    {
      title: 'Analytics',
      items: [
        { label: 'Reports', href: '/reports', num: '10' },
        { label: 'Costs',   href: '/costs',   num: '11' },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Compliance', href: '/settings/compliance',        num: '12' },
        { label: 'Renewals',   href: '/settings/business-renewals', num: '13' },
        { label: 'Audit',      href: '/audit',                      num: '14' },
        { label: 'Settings',   href: '/settings',                   num: '15' },
      ],
    },
  ];

  const brandStyle: React.CSSProperties = {
    color: 'var(--p-text)',
    fontFamily: 'var(--font-fraunces), Georgia, serif',
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: '0.12em',
  };

  return (
    <>
      {/* ── DESKTOP sidebar ─────────────────────────────────────────── */}
      <aside
        className="hidden h-screen w-52 flex-col border-r md:flex flex-shrink-0"
        style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
      >
        <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: 'var(--p-border)' }}>
          <span style={brandStyle}>ATELIER.</span>
        </div>
        <NavInner sections={sections} userEmail={userEmail} pathname={pathname} />
      </aside>

      {/* ── MOBILE header bar ───────────────────────────────────────── */}
      <div
        className="flex md:hidden h-12 flex-shrink-0 items-center justify-between border-b px-4"
        style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
      >
        <span style={{ ...brandStyle, fontSize: 14 }}>ATELIER.</span>
        <div className="flex items-center gap-3">
          {liveInboxCount > 0 && (
            <Link
              href="/inbox"
              className="relative flex items-center justify-center rounded-full w-7 h-7"
              style={{
                background: 'var(--p-bg)',
                border: '1px solid var(--p-border)',
                color: 'var(--p-text)',
                fontFamily: 'var(--font-dm-mono), monospace',
                fontSize: 10,
              }}
              aria-label={`Inbox — ${liveInboxCount} pending`}
            >
              {liveInboxCount > 9 ? '9+' : liveInboxCount}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex flex-col items-center justify-center w-8 h-8 gap-1.5"
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
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute left-0 top-0 bottom-0 flex w-72 flex-col"
            style={{ background: 'var(--p-surface)', borderRight: '1px solid var(--p-border)' }}
          >
            <div
              className="flex h-14 items-center justify-between border-b px-5"
              style={{ borderColor: 'var(--p-border)' }}
            >
              <span style={{ ...brandStyle, fontSize: 14 }}>ATELIER.</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="flex items-center justify-center w-8 h-8 text-lg"
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
