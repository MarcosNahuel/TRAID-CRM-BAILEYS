'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Contact,
  Network,
  CalendarDays,
  TrendingUp,
  Upload,
  Settings,
  Menu,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard',    href: '/crm',             icon: <LayoutDashboard size={18} /> },
  { label: 'Contactos',    href: '/crm/contacts',    icon: <Contact size={18} /> },
  { label: 'Grafo',        href: '/crm/graph',       icon: <Network size={18} /> },
  { label: 'Mi Día',       href: '/crm/daily',       icon: <CalendarDays size={18} /> },
  { label: 'Crecimiento',  href: '/crm/growth',      icon: <TrendingUp size={18} /> },
  { label: 'Alimentar',    href: '/crm/feed',        icon: <Upload size={18} /> },
  { label: 'Config',       href: '/crm/settings',    icon: <Settings size={18} /> },
];

export default function CrmSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { setIsOpen(false); }, [pathname]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  function isActive(href: string) {
    if (href === '/crm') return pathname === '/crm';
    return pathname === href || pathname.startsWith(href + '/');
  }

  function navItemClass(href: string) {
    if (isActive(href)) {
      return 'flex items-center gap-3 px-4 py-2.5 rounded-lg border-l-2 border-[#7c3aed] bg-[#7c3aed]/10 text-[#7c3aed] transition-colors';
    }
    return 'flex items-center gap-3 px-4 py-2.5 rounded-lg border-l-2 border-transparent text-[#8b92b0] hover:text-white hover:bg-[#7c3aed]/5 transition-colors';
  }

  return (
    <>
      {/* Hamburger — mobile */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#141829] border border-[#7c3aed]/20 text-white md:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Overlay — mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          flex flex-col h-screen shrink-0 border-r border-[#7c3aed]/10
          fixed md:sticky top-0 z-50 w-[240px]
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
        style={{ backgroundColor: '#050510' }}
      >
        {/* Logo */}
        <div className="px-5 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)' }}>
              S
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight gradient-text">SUPER YO</p>
              <p className="text-[10px] text-[#8b92b0] font-medium tracking-widest uppercase">Sistema Personal</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded text-[#8b92b0] hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={navItemClass(item.href)}>
              <span className="shrink-0">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-[#7c3aed]/10">
          <div className="px-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-[10px] text-[#555570]">Super Yo &middot; TRAID</span>
          </div>
        </div>
      </aside>
    </>
  );
}
