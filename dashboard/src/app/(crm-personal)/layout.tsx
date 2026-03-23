'use client';

import { usePathname } from 'next/navigation';
import CrmSidebar from '@/components/crm/Sidebar';
import AuthGuard from '@/components/crm/AuthGuard';

export default function CrmPersonalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/crm-login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="flex h-screen">
        <CrmSidebar />
        <main className="flex-1 overflow-y-auto bg-[#0a0a0f] pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
