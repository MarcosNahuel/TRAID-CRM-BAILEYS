'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Loader2, Zap, BookOpen, Scale, FileText } from 'lucide-react';

// --- Tipos ---

interface Trigger {
  id: string;
  title: string;
  emotional_context: string;
  scope: string;
  created_at: string;
}

interface GrowthLog {
  id: string;
  content: string;
  type: string;
  scope: string;
  created_at: string;
}

interface Principle {
  id: string;
  title: string;
  description: string;
  reinforcement_count: number;
  scope: string;
}

interface Decision {
  id: string;
  title: string;
  context: string;
  reasoning: string;
  scope: string;
  created_at: string;
}

type Tab = 'triggers' | 'logs' | 'principios' | 'decisiones';

// --- Helpers ---

const SCOPE_STYLES: Record<string, { bg: string; color: string }> = {
  traid:    { bg: 'rgba(124,58,237,0.2)', color: '#7c3aed' },
  family:   { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  personal: { bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6' },
  dge:      { bg: 'rgba(34,197,94,0.2)',   color: '#22c55e' },
  health:   { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444' },
  friends:  { bg: 'rgba(234,179,8,0.2)',   color: '#eab308' },
};

const TABS: { key: Tab; label: string; icon: typeof Zap }[] = [
  { key: 'triggers',    label: 'Triggers',    icon: Zap },
  { key: 'logs',        label: 'Logs',        icon: FileText },
  { key: 'principios',  label: 'Principios',  icon: BookOpen },
  { key: 'decisiones',  label: 'Decisiones',  icon: Scale },
];

const TAB_COLORS: Record<Tab, string> = {
  triggers:   '#f59e0b',
  logs:       '#3b82f6',
  principios: '#7c3aed',
  decisiones: '#db2777',
};

export default function GrowthPage() {
  const [activeTab, setActiveTab] = useState<Tab>('triggers');
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [logs, setLogs] = useState<GrowthLog[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/crm/growth');
        const data = await res.json();
        setTriggers(data.triggers ?? []);
        setLogs(data.logs ?? []);
        setPrinciples(data.principles ?? []);
        setDecisions(data.decisions ?? []);
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

  function renderScopeBadge(scope: string) {
    const style = SCOPE_STYLES[scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ backgroundColor: style.bg, color: style.color }}
      >
        {scope}
      </span>
    );
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TrendingUp size={20} className="text-[#7c3aed]" />
          Crecimiento
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">Timeline estoico de crecimiento personal &middot; CRM Personal</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full font-semibold transition-colors"
              style={isActive
                ? { backgroundColor: TAB_COLORS[tab.key], color: '#fff' }
                : { backgroundColor: '#1a1a24', color: '#8888a0', border: '1px solid #2a2a3a' }
              }
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenido del tab activo */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>

        {/* Triggers */}
        {activeTab === 'triggers' && (
          <>
            <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap size={14} className="text-[#f59e0b]" />
                Triggers Emocionales
              </h3>
              <span className="text-xs text-[#8888a0]">{triggers.length} registros</span>
            </div>
            {triggers.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#555570]">Sin triggers registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a3a]/50">
                {triggers.map(trigger => (
                  <div key={trigger.id} className="px-5 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium">{trigger.title}</p>
                          <p className="text-xs text-[#f59e0b] mt-1">
                            {trigger.emotional_context}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {renderScopeBadge(trigger.scope)}
                            <span className="text-[10px] text-[#555570]">{formatDate(trigger.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <>
            <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText size={14} className="text-[#3b82f6]" />
                Logs de Crecimiento
              </h3>
              <span className="text-xs text-[#8888a0]">{logs.length} registros</span>
            </div>
            {logs.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#555570]">Sin logs registrados</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a3a]/50">
                {logs.map(log => (
                  <div key={log.id} className="px-5 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{log.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: 'rgba(59,130,246,0.2)', color: '#3b82f6' }}
                          >
                            {log.type}
                          </span>
                          {renderScopeBadge(log.scope)}
                          <span className="text-[10px] text-[#555570]">{formatDate(log.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Principios */}
        {activeTab === 'principios' && (
          <>
            <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BookOpen size={14} className="text-[#7c3aed]" />
                Principios
              </h3>
              <span className="text-xs text-[#8888a0]">{principles.length} principios</span>
            </div>
            {principles.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#555570]">Sin principios definidos</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a3a]/50">
                {principles.map(principle => (
                  <div key={principle.id} className="px-5 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: '#7c3aed' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
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
                          {renderScopeBadge(principle.scope)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Decisiones */}
        {activeTab === 'decisiones' && (
          <>
            <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Scale size={14} className="text-[#db2777]" />
                Decisiones
              </h3>
              <span className="text-xs text-[#8888a0]">{decisions.length} decisiones</span>
            </div>
            {decisions.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[#555570]">Sin decisiones registradas</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a3a]/50">
                {decisions.map(decision => (
                  <div key={decision.id} className="px-5 py-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: '#db2777' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{decision.title}</p>
                        {decision.context && (
                          <p className="text-xs text-[#8888a0] mt-1">
                            <span className="text-[#555570]">Contexto:</span> {decision.context}
                          </p>
                        )}
                        {decision.reasoning && (
                          <p className="text-xs text-[#db2777] mt-1">
                            <span className="text-[#555570]">Razonamiento:</span> {decision.reasoning}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {renderScopeBadge(decision.scope)}
                          <span className="text-[10px] text-[#555570]">{formatDate(decision.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
