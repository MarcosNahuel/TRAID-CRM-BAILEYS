'use client';

import { useEffect, useState } from 'react';
import { Settings, Loader2, Database, Link, BookOpen, Info, User, Building2, Hash, Calendar, ListTodo, FolderKanban } from 'lucide-react';

// --- Tipos ---

interface EntityStat {
  type: string;
  count: number;
}

interface PrincipleItem {
  id: string;
  title: string;
  description: string;
  reinforcement_count: number;
  scope: string;
}

interface SystemInfo {
  version: string;
  last_sync: string;
  graph_engine: string;
}

// --- Helpers ---

const ENTITY_TYPE_STYLES: Record<string, { color: string; icon: typeof User }> = {
  person:       { color: '#7c3aed', icon: User },
  organization: { color: '#db2777', icon: Building2 },
  topic:        { color: '#3b82f6', icon: Hash },
  event:        { color: '#f59e0b', icon: Calendar },
  task:         { color: '#ef4444', icon: ListTodo },
  project:      { color: '#22c55e', icon: FolderKanban },
  principle:    { color: '#8b5cf6', icon: BookOpen },
};

const SCOPE_STYLES: Record<string, { bg: string; color: string }> = {
  traid:    { bg: 'rgba(124,58,237,0.2)', color: '#7c3aed' },
  family:   { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  personal: { bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6' },
  dge:      { bg: 'rgba(34,197,94,0.2)',   color: '#22c55e' },
  health:   { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444' },
  friends:  { bg: 'rgba(234,179,8,0.2)',   color: '#eab308' },
};

export default function SettingsPage() {
  const [entityStats, setEntityStats] = useState<EntityStat[]>([]);
  const [totalLinks, setTotalLinks] = useState(0);
  const [principles, setPrinciples] = useState<PrincipleItem[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/crm/settings');
        const data = await res.json();
        setEntityStats(data.entity_stats ?? []);
        setTotalLinks(data.total_links ?? 0);
        setPrinciples(data.principles ?? []);
        setSystemInfo(data.system_info ?? null);
      } catch {
        // silenciar
      } finally {
        setLoading(false);
      }
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

  const totalEntities = entityStats.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings size={20} className="text-[#7c3aed]" />
          Configuración Super Yo
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">Estado del sistema y configuración &middot; CRM Personal</p>
      </div>

      {/* Stats: entidades por tipo */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Database size={14} className="text-[#7c3aed]" />
          Entidades por tipo
          <span className="text-xs text-[#8888a0] font-normal ml-1">({totalEntities} total)</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {entityStats.map(stat => {
            const typeStyle = ENTITY_TYPE_STYLES[stat.type] ?? { color: '#6b7280', icon: Hash };
            const Icon = typeStyle.icon;
            return (
              <div
                key={stat.type}
                className="rounded-xl p-4 text-center"
                style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}
              >
                <Icon size={18} className="mx-auto mb-2" style={{ color: typeStyle.color }} />
                <p className="text-xl font-bold text-white">{stat.count}</p>
                <p className="text-[10px] text-[#8888a0] uppercase tracking-wider mt-1 capitalize">{stat.type}</p>
              </div>
            );
          })}

          {/* Links count */}
          <div
            className="rounded-xl p-4 text-center"
            style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}
          >
            <Link size={18} className="mx-auto mb-2 text-[#db2777]" />
            <p className="text-xl font-bold text-white">{totalLinks}</p>
            <p className="text-[10px] text-[#8888a0] uppercase tracking-wider mt-1">Links</p>
          </div>
        </div>
      </div>

      {/* Principios */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BookOpen size={14} className="text-[#7c3aed]" />
            Principios del Super Yo
          </h3>
          <span className="text-xs text-[#8888a0]">{principles.length} principios</span>
        </div>

        {principles.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-[#555570]">Sin principios definidos</p>
            <p className="text-xs text-[#555570] mt-1">Los principios se crean desde el módulo de Crecimiento</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2a2a3a]/50">
            {principles.map(principle => {
              const scopeStyle = SCOPE_STYLES[principle.scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
              return (
                <div key={principle.id} className="px-5 py-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium">{principle.title}</p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: 'rgba(124,58,237,0.2)', color: '#7c3aed' }}
                        >
                          x{principle.reinforcement_count}
                        </span>
                      </div>
                      <p className="text-xs text-[#8888a0] mt-1">{principle.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: scopeStyle.bg, color: scopeStyle.color }}
                        >
                          {principle.scope}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <div className="px-5 py-4 border-b border-[#2a2a3a]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Info size={14} className="text-[#8888a0]" />
            Información del sistema
          </h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8888a0]">Versión</span>
            <span className="text-xs text-white font-mono">{systemInfo?.version ?? '1.0.0'}</span>
          </div>
          <div className="h-px bg-[#2a2a3a]/50" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8888a0]">Última sincronización</span>
            <span className="text-xs text-white">
              {systemInfo?.last_sync
                ? new Date(systemInfo.last_sync).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—'}
            </span>
          </div>
          <div className="h-px bg-[#2a2a3a]/50" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8888a0]">Motor del grafo</span>
            <span className="text-xs text-white font-mono">{systemInfo?.graph_engine ?? 'Supabase + pgvector'}</span>
          </div>
          <div className="h-px bg-[#2a2a3a]/50" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8888a0]">Total entidades</span>
            <span className="text-xs text-[#7c3aed] font-bold">{totalEntities}</span>
          </div>
          <div className="h-px bg-[#2a2a3a]/50" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#8888a0]">Total links</span>
            <span className="text-xs text-[#db2777] font-bold">{totalLinks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
