'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutAction } from '@/app/actions/auth';

type NavItem = { label: string; href: string; badge?: number };
type NavSection = { title?: string; items: NavItem[] };

type Props = { inboxCount?: number; userEmail?: string | null };

export default function Sidebar({ inboxCount = 0, userEmail = null }: Props) {
  const pathname = usePathname();

  const sections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard', href: '/' },
        { label: 'Inbox', href: '/inbox', badge: inboxCount },
        { label: 'Bookings', href: '/bookings' },
        { label: 'Talent', href: '/talent' },
        { label: 'Crew', href: '/crew' },
        { label: 'Crew Bookings', href: '/crew-bookings' },
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
        { label: 'Audit', href: '/audit' },
        { label: 'Settings', href: '/settings' },
      ],
    },
  ];

  return (
    <aside
      className="hidden h-screen w-56 flex-col border-r md:flex"
      style={{ background: 'var(--p-surface)', borderColor: 'var(--p-border)' }}
    >
      <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: 'var(--p-border)' }}>
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--p-accent)' }}>
          Atelier
        </span>
      </div>

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
    </aside>
  );
}
