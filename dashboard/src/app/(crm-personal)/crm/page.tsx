'use client';

import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Network, CalendarDays, TrendingUp, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface Stats {
  entity_type: string;
  count: number;
}

export default function SuperYoDashboard() {
  const [stats, setStats] = useState<Stats[]>([]);
  const [totalLinks, setTotalLinks] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/crm/settings');
        const json = await res.json();
        setStats(json.stats ?? []);
        setTotalLinks(json.totalLinks ?? 0);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={32} className="animate-spin text-[#7c3aed]" />
      </div>
    );
  }

  const totalEntities = stats.reduce((sum, s) => sum + s.count, 0);
  const personCount = stats.find(s => s.entity_type === 'person')?.count ?? 0;
  const topicCount = stats.find(s => s.entity_type === 'topic')?.count ?? 0;
  const taskCount = stats.find(s => s.entity_type === 'task')?.count ?? 0;

  const cards = [
    { label: 'Contactos', value: personCount, icon: <Users size={18} />, href: '/crm/contacts', color: '#7c3aed' },
    { label: 'Entidades', value: totalEntities, icon: <Network size={18} />, href: '/crm/graph', color: '#3b82f6' },
    { label: 'Topics', value: topicCount, icon: <TrendingUp size={18} />, href: '/crm/growth', color: '#22c55e' },
    { label: 'Tareas', value: taskCount, icon: <CalendarDays size={18} />, href: '/crm/daily', color: '#f59e0b' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <LayoutDashboard size={20} className="text-[#7c3aed]" />
          Super Yo
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">Sistema Operativo Personal &middot; {totalLinks} conexiones</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(card => (
          <Link key={card.label} href={card.href}>
            <div className="rounded-xl p-5 hover:border-[#7c3aed]/30 transition-colors cursor-pointer"
              style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: card.color }}>{card.icon}</span>
                <span className="text-xs text-[#8888a0] font-medium">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <h2 className="text-sm font-semibold text-white mb-3">Entidades por tipo</h2>
        <div className="space-y-2">
          {stats.map(s => (
            <div key={s.entity_type} className="flex items-center gap-3">
              <span className="text-xs text-[#8888a0] w-28">{s.entity_type}</span>
              <div className="flex-1 h-2 rounded-full bg-[#2a2a3a]">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min((s.count / Math.max(totalEntities, 1)) * 100, 100)}%`,
                    background: 'linear-gradient(135deg, #7c3aed, #db2777)',
                  }}
                />
              </div>
              <span className="text-xs text-white font-mono w-8 text-right">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
