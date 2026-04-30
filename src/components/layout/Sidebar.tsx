'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { label: string; href: string };
type NavSection = { title?: string; items: NavItem[] };

const sections: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Inbox', href: '/inbox' },
      { label: 'Bookings', href: '/bookings' },
      { label: 'Talent', href: '/talent' },
      { label: 'Crew', href: '/crew' },
      { label: 'Crew Bookings', href: '/crew-bookings' },
      { label: 'Clients', href: '/clients' },
      { label: 'Campaigns', href: '/campaigns' },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Costs', href: '/costs' },
      { label: 'Audit', href: '/audit' },
      { label: 'Settings', href: '/settings' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden h-screen w-56 flex-col border-r md:flex"
      style={{ background: '#1a1d27', borderColor: '#2e3347' }}
    >
      <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: '#2e3347' }}>
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#6c8aff' }}>
          Atelier
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? 'mt-6' : ''}>
            {section.title && (
              <div
                className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#6b7186' }}
              >
                {section.title}
              </div>
            )}
            <ul className="space-y-1">
              {section.items.map(({ label, href }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center rounded-md px-3 py-2 text-sm transition-colors"
                      style={{
                        color: active ? '#e8eaed' : '#9aa0b4',
                        background: active ? '#2e3347' : 'transparent',
                      }}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
