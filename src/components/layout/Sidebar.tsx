'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { label: 'Dashboard', href: '/' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'Bookings', href: '/bookings' },
  { label: 'Talent', href: '/talent' },
  { label: 'Crew', href: '/crew' },
  { label: 'Clients', href: '/clients' },
  { label: 'Costs', href: '/costs' },
  { label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex h-screen w-56 flex-col border-r"
      style={{ background: '#1a1d27', borderColor: '#2e3347' }}
    >
      <div className="flex h-14 items-center px-5 border-b" style={{ borderColor: '#2e3347' }}>
        <span className="text-sm font-semibold tracking-widest uppercase" style={{ color: '#6c8aff' }}>
          Atelier
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-1">
          {nav.map(({ label, href }) => {
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
      </nav>
    </aside>
  );
}
