'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, CheckSquare, Calendar, Handshake } from 'lucide-react';

// --- Tipos ---

interface DailyTask {
  id: string;
  title: string;
  scope: string;
  priority: 'high' | 'medium' | 'low';
  done: boolean;
}

interface DailyEvent {
  id: string;
  title: string;
  scope: string;
  datetime: string | null;
}

interface DailyCommitment {
  id: string;
  title: string;
  scope: string;
  context: string;
}

// --- Helpers ---

const SCOPE_STYLES: Record<string, { bg: string; color: string }> = {
  traid:    { bg: 'rgba(124,58,237,0.2)', color: '#7c3aed' },
  family:   { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  personal: { bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6' },
  dge:      { bg: 'rgba(34,197,94,0.2)',   color: '#22c55e' },
  health:   { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444' },
  friends:  { bg: 'rgba(234,179,8,0.2)',   color: '#eab308' },
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    '#22c55e',
};

const PRIORITY_LABELS: Record<string, string> = {
  high:   'Alta',
  medium: 'Media',
  low:    'Baja',
};

function formatToday(): string {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function DailyPage() {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [events, setEvents] = useState<DailyEvent[]>([]);
  const [commitments, setCommitments] = useState<DailyCommitment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/crm/daily');
        const data = await res.json();
        setTasks(data.tasks ?? []);
        setEvents(data.events ?? []);
        setCommitments(data.commitments ?? []);
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays size={20} className="text-[#7c3aed]" />
          Mi Día
        </h1>
        <p className="text-sm text-[#8888a0] mt-1 capitalize">{formatToday()}</p>
      </div>

      {/* 3 columnas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Tareas */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <CheckSquare size={14} className="text-[#7c3aed]" />
              Tareas
            </h3>
            <span className="text-xs text-[#8888a0]">{tasks.length}</span>
          </div>

          {tasks.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#555570]">Sin tareas pendientes</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a3a]/50">
              {tasks.map(task => {
                const scopeStyle = SCOPE_STYLES[task.scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
                return (
                  <div key={task.id} className="px-5 py-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.done ? 'text-[#555570] line-through' : 'text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: scopeStyle.bg, color: scopeStyle.color }}
                          >
                            {task.scope}
                          </span>
                          <span
                            className="text-[10px] font-semibold"
                            style={{ color: PRIORITY_COLORS[task.priority] ?? '#6b7280' }}
                          >
                            {PRIORITY_LABELS[task.priority] ?? task.priority}
                          </span>
                        </div>
                      </div>
                      <span
                        className="shrink-0 w-2.5 h-2.5 rounded-full mt-1.5"
                        style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? '#6b7280' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Eventos */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Calendar size={14} className="text-[#db2777]" />
              Eventos
            </h3>
            <span className="text-xs text-[#8888a0]">{events.length}</span>
          </div>

          {events.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#555570]">Sin eventos hoy</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a3a]/50">
              {events.map(event => {
                const scopeStyle = SCOPE_STYLES[event.scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
                return (
                  <div key={event.id} className="px-5 py-3 hover:bg-white/5 transition-colors">
                    <p className="text-sm text-white font-medium">{event.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: scopeStyle.bg, color: scopeStyle.color }}
                      >
                        {event.scope}
                      </span>
                      {event.datetime && (
                        <span className="text-[10px] text-[#8888a0]">
                          {new Date(event.datetime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compromisos */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <div className="px-5 py-4 border-b border-[#2a2a3a] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Handshake size={14} className="text-[#f59e0b]" />
              Compromisos
            </h3>
            <span className="text-xs text-[#8888a0]">{commitments.length}</span>
          </div>

          {commitments.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[#555570]">Sin compromisos pendientes</p>
            </div>
          ) : (
            <div className="divide-y divide-[#2a2a3a]/50">
              {commitments.map(commitment => {
                const scopeStyle = SCOPE_STYLES[commitment.scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
                return (
                  <div key={commitment.id} className="px-5 py-3 hover:bg-white/5 transition-colors">
                    <p className="text-sm text-white font-medium">{commitment.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ backgroundColor: scopeStyle.bg, color: scopeStyle.color }}
                      >
                        {commitment.scope}
                      </span>
                    </div>
                    {commitment.context && (
                      <p className="text-xs text-[#8888a0] mt-1">{commitment.context}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
