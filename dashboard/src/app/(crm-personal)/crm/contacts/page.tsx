'use client';

import { useEffect, useState } from 'react';
import { Contact, Loader2, Search, ArrowUpDown } from 'lucide-react';

// --- Tipos ---

interface ContactItem {
  id: string;
  name: string;
  scopes: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  business_relevance: number;
  last_interaction: string;
  summary: string;
}

type Scope = 'all' | 'traid' | 'family' | 'personal' | 'dge' | 'health' | 'friends';
type SortBy = 'interaction' | 'relevance';

// --- Helpers ---

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all',      label: 'Todos' },
  { key: 'traid',    label: 'TRAID' },
  { key: 'family',   label: 'Familia' },
  { key: 'personal', label: 'Personal' },
  { key: 'dge',      label: 'DGE' },
  { key: 'health',   label: 'Salud' },
  { key: 'friends',  label: 'Amigos' },
];

const SCOPE_STYLES: Record<string, { bg: string; color: string }> = {
  traid:    { bg: 'rgba(124,58,237,0.2)', color: '#7c3aed' },
  family:   { bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
  personal: { bg: 'rgba(59,130,246,0.2)',  color: '#3b82f6' },
  dge:      { bg: 'rgba(34,197,94,0.2)',   color: '#22c55e' },
  health:   { bg: 'rgba(239,68,68,0.2)',   color: '#ef4444' },
  friends:  { bg: 'rgba(234,179,8,0.2)',   color: '#eab308' },
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#22c55e',
  neutral:  '#6b7280',
  negative: '#ef4444',
};

const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positivo',
  neutral:  'Neutral',
  negative: 'Negativo',
};

function relevanceColor(value: number): string {
  if (value <= 30) return '#ef4444';
  if (value <= 60) return '#f59e0b';
  return '#22c55e';
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('interaction');

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (filterScope !== 'all') params.set('scope', filterScope);
        if (search) params.set('q', search);
        params.set('sort', sortBy);

        const res = await fetch(`/api/crm/contacts?${params}`);
        const data = await res.json();
        setContacts(data.contacts ?? []);
      } catch {
        // silenciar
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filterScope, search, sortBy]);

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
          <Contact size={20} className="text-[#7c3aed]" />
          Contactos
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">Red de contactos del Super Yo &middot; CRM Personal</p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Scope filter pills */}
        {SCOPES.map(s => (
          <button
            key={s.key}
            onClick={() => setFilterScope(s.key)}
            className="text-xs px-4 py-2 rounded-full font-semibold transition-colors"
            style={filterScope === s.key
              ? { backgroundColor: s.key === 'all' ? '#7c3aed' : (SCOPE_STYLES[s.key]?.color ?? '#7c3aed'), color: '#fff' }
              : { backgroundColor: '#1a1a24', color: '#8888a0', border: '1px solid #2a2a3a' }
            }
          >
            {s.label}
          </button>
        ))}

        {/* Sort + Search */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSortBy(sortBy === 'interaction' ? 'relevance' : 'interaction')}
            className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 text-[#8888a0] hover:text-white transition-colors"
            style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}
          >
            <ArrowUpDown size={12} />
            {sortBy === 'interaction' ? 'Por interacción' : 'Por relevancia'}
          </button>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555570]" />
            <input
              type="text"
              placeholder="Buscar contacto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs rounded-lg pl-8 pr-3 py-2 text-white placeholder-[#555570]"
              style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a', width: 220 }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de contactos */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#8888a0] border-b border-[#2a2a3a]">
                <th className="px-5 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Ámbitos</th>
                <th className="px-4 py-3 text-center font-medium">Sentimiento</th>
                <th className="px-4 py-3 text-center font-medium">Relevancia</th>
                <th className="px-4 py-3 text-left font-medium">Última interacción</th>
                <th className="px-4 py-3 text-left font-medium">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(contact => (
                <tr key={contact.id} className="border-b border-[#2a2a3a]/50 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{contact.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {contact.scopes.map(scope => {
                        const style = SCOPE_STYLES[scope] ?? { bg: 'rgba(107,114,128,0.2)', color: '#6b7280' };
                        return (
                          <span
                            key={scope}
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: style.bg, color: style.color }}
                          >
                            {scope}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold"
                      style={{ color: SENTIMENT_COLORS[contact.sentiment] ?? '#6b7280' }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: SENTIMENT_COLORS[contact.sentiment] ?? '#6b7280' }}
                      />
                      {SENTIMENT_LABELS[contact.sentiment] ?? contact.sentiment}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#2a2a3a' }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${contact.business_relevance}%`, backgroundColor: relevanceColor(contact.business_relevance) }}
                        />
                      </div>
                      <span className="font-bold text-[11px]" style={{ color: relevanceColor(contact.business_relevance) }}>
                        {contact.business_relevance}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#8888a0]">
                    {contact.last_interaction
                      ? new Date(contact.last_interaction).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#8888a0] max-w-[200px] truncate">
                    {contact.summary || '—'}
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[#555570]">
                    No se encontraron contactos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
