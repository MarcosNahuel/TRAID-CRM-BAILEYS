'use client';

import { useEffect, useState } from 'react';
import { Upload, Loader2, Database, User, Building2, Hash, Calendar, ListTodo, FolderKanban, BookOpen } from 'lucide-react';

// --- Tipos ---

interface EntityStat {
  type: string;
  count: number;
}

interface RecentEntity {
  id: string;
  name: string;
  entity_type: string;
  scope: string;
  created_at: string;
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

export default function FeedPage() {
  const [entityStats, setEntityStats] = useState<EntityStat[]>([]);
  const [recentEntities, setRecentEntities] = useState<RecentEntity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/crm/settings');
        const data = await res.json();
        setEntityStats(data.entity_stats ?? []);
        setRecentEntities(data.recent_entities ?? []);
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
          <Upload size={20} className="text-[#7c3aed]" />
          Alimentar Super Yo
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">
          Subí conversaciones de WhatsApp, audios o documentos para alimentar tu Knowledge Graph
        </p>
      </div>

      {/* Upload area */}
      <div
        className="rounded-xl p-8 flex flex-col items-center justify-center text-center"
        style={{ backgroundColor: '#1a1a24', border: '2px dashed #2a2a3a', minHeight: 200 }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(219,39,119,0.2))' }}
        >
          <Upload size={28} className="text-[#7c3aed]" />
        </div>
        <p className="text-lg font-semibold text-white mb-1">Drag & Drop</p>
        <p className="text-sm text-[#8888a0] mb-4">
          Arrastrá archivos .txt, .json, audios o exportaciones de WhatsApp
        </p>
        <span
          className="rounded-full px-4 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: 'rgba(124,58,237,0.2)', color: '#7c3aed' }}
        >
          Próximamente
        </span>
      </div>

      {/* Stats por tipo de entidad */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Database size={14} className="text-[#7c3aed]" />
          Entidades ingeridas
          <span className="text-xs text-[#8888a0] font-normal ml-1">({totalEntities} total)</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
          {entityStats.length === 0 && (
            <div className="col-span-full rounded-xl p-6 text-center" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
              <p className="text-sm text-[#555570]">Sin entidades aún</p>
            </div>
          )}
        </div>
      </div>

      {/* Entidades recientes */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Últimas entidades ingeridas</h3>
          <span className="text-xs text-[#8888a0]">{recentEntities.length} recientes</span>
        </div>

        {recentEntities.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-[#555570]">Sin entidades recientes</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2a2a3a]/50">
            {recentEntities.map(entity => {
              const typeStyle = ENTITY_TYPE_STYLES[entity.entity_type] ?? { color: '#6b7280', icon: Hash };
              const Icon = typeStyle.icon;
              const scopeStyle = SCOPE_STYLES[entity.scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };

              return (
                <div key={entity.id} className="px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon size={14} style={{ color: typeStyle.color }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{entity.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                          style={{ backgroundColor: `${typeStyle.color}20`, color: typeStyle.color }}
                        >
                          {entity.entity_type}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: scopeStyle.bg, color: scopeStyle.color }}
                        >
                          {entity.scope}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-[#555570] shrink-0 ml-3">
                    {new Date(entity.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
