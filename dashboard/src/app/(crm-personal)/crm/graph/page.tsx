'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Network, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// --- Tipos ---

interface GraphNode {
  id: string;
  name: string;
  entity_type: string;
  scope: string;
  business_relevance: number;
}

interface GraphLink {
  source: string;
  target: string;
  scope: string;
  relationship: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

type Scope = 'all' | 'traid' | 'family' | 'personal' | 'dge' | 'health' | 'friends';
type EntityType = 'all' | 'person' | 'organization' | 'topic' | 'event' | 'task' | 'project' | 'principle';

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

const ENTITY_TYPES: { key: EntityType; label: string }[] = [
  { key: 'all',          label: 'Todos' },
  { key: 'person',       label: 'Personas' },
  { key: 'organization', label: 'Organizaciones' },
  { key: 'topic',        label: 'Temas' },
  { key: 'event',        label: 'Eventos' },
  { key: 'task',         label: 'Tareas' },
  { key: 'project',      label: 'Proyectos' },
  { key: 'principle',    label: 'Principios' },
];

const NODE_COLORS: Record<string, string> = {
  person:       '#7c3aed',
  organization: '#db2777',
  topic:        '#3b82f6',
  event:        '#f59e0b',
  task:         '#ef4444',
  project:      '#22c55e',
  principle:    '#8b5cf6',
};

const SCOPE_LINK_COLORS: Record<string, string> = {
  traid:    '#7c3aed',
  family:   '#fb923c',
  personal: '#3b82f6',
  dge:      '#22c55e',
  health:   '#ef4444',
  friends:  '#eab308',
};

function getNodeColor(entityType: string): string {
  return NODE_COLORS[entityType] ?? '#6b7280';
}

function getNodeSize(businessRelevance: number): number {
  const min = 4;
  const max = 16;
  const clamped = Math.max(0, Math.min(100, businessRelevance));
  return min + (clamped / 100) * (max - min);
}

function getLinkColor(scope: string): string {
  return SCOPE_LINK_COLORS[scope] ?? '#2a2a3a';
}

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [filterScope, setFilterScope] = useState<Scope>('all');
  const [filterEntity, setFilterEntity] = useState<EntityType>('all');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (filterScope !== 'all') params.set('scope', filterScope);
        if (filterEntity !== 'all') params.set('entity_type', filterEntity);

        const res = await fetch(`/api/crm/graph?${params}`);
        const data = await res.json();
        setGraphData({
          nodes: data.nodes ?? [],
          links: data.links ?? [],
        });
      } catch {
        // silenciar
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filterScope, filterEntity]);

  // Calcular dimensiones del contenedor
  useEffect(() => {
    function updateDimensions() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    }
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeHover = useCallback((node: GraphNode | null, event?: MouseEvent) => {
    if (node && event) {
      setTooltip({ x: event.clientX, y: event.clientY, node });
    } else {
      setTooltip(null);
    }
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
          <Network size={20} className="text-[#7c3aed]" />
          Knowledge Graph
        </h1>
        <p className="text-sm text-[#8888a0] mt-1">Grafo de conocimiento del Super Yo &middot; CRM Personal</p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Scope filter */}
        {SCOPES.map(s => (
          <button
            key={s.key}
            onClick={() => setFilterScope(s.key)}
            className="text-xs px-4 py-2 rounded-full font-semibold transition-colors"
            style={filterScope === s.key
              ? { backgroundColor: '#7c3aed', color: '#fff' }
              : { backgroundColor: '#1a1a24', color: '#8888a0', border: '1px solid #2a2a3a' }
            }
          >
            {s.label}
          </button>
        ))}

        <div className="w-px h-6 bg-[#2a2a3a] mx-1" />

        {/* Entity type filter */}
        <select
          value={filterEntity}
          onChange={e => setFilterEntity(e.target.value as EntityType)}
          className="text-xs rounded-lg px-3 py-2 text-white"
          style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}
        >
          {ENTITY_TYPES.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        {/* Leyenda */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-[#8888a0] capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grafo */}
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden relative"
        style={{ backgroundColor: '#0a0a0f', border: '1px solid #2a2a3a', height: 520 }}
      >
        {graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Network size={32} className="mx-auto text-[#555570] mb-3" />
              <p className="text-sm text-[#555570]">Sin entidades en el grafo</p>
              <p className="text-xs text-[#555570] mt-1">Alimentá el Super Yo para ver conexiones</p>
            </div>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={520}
            backgroundColor="#0a0a0f"
            nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D) => {
              const size = getNodeSize(node.business_relevance ?? 50);
              const color = getNodeColor(node.entity_type ?? '');

              // Nodo
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();

              // Label
              const label = node.name ?? '';
              ctx.font = '3px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = '#ffffff';
              ctx.fillText(label, node.x!, node.y! + size + 4);
            }}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              const size = getNodeSize(node.business_relevance ?? 50);
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, size + 2, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link: any) => getLinkColor(link.scope ?? '')}
            linkWidth={0.5}
            linkDirectionalParticles={0}
            onNodeHover={(node: any, prevNode: any) => {
              // Tooltip manejado por CSS
              if (node) {
                setTooltip({ x: 0, y: 0, node });
              } else {
                setTooltip(null);
              }
            }}
          />
        )}

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute top-4 right-4 rounded-lg px-4 py-3 pointer-events-none z-10"
            style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}
          >
            <p className="text-sm text-white font-medium">{tooltip.node.name}</p>
            <p className="text-[10px] text-[#8888a0] mt-1 capitalize">
              Tipo: <span style={{ color: getNodeColor(tooltip.node.entity_type) }}>{tooltip.node.entity_type}</span>
            </p>
            <p className="text-[10px] text-[#8888a0]">
              Ámbito: {tooltip.node.scope}
            </p>
            <p className="text-[10px] text-[#8888a0]">
              Relevancia: {tooltip.node.business_relevance}
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <p className="text-xs text-[#8888a0] uppercase tracking-widest font-semibold mb-2">Nodos</p>
          <p className="text-2xl font-bold text-[#7c3aed]">{graphData.nodes.length}</p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <p className="text-xs text-[#8888a0] uppercase tracking-widest font-semibold mb-2">Conexiones</p>
          <p className="text-2xl font-bold text-[#db2777]">{graphData.links.length}</p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <p className="text-xs text-[#8888a0] uppercase tracking-widest font-semibold mb-2">Tipos de entidad</p>
          <p className="text-2xl font-bold text-white">
            {new Set(graphData.nodes.map(n => n.entity_type)).size}
          </p>
        </div>
        <div className="rounded-xl p-5" style={{ backgroundColor: '#1a1a24', border: '1px solid #2a2a3a' }}>
          <p className="text-xs text-[#8888a0] uppercase tracking-widest font-semibold mb-2">Ámbitos activos</p>
          <p className="text-2xl font-bold text-white">
            {new Set(graphData.nodes.map(n => n.scope)).size}
          </p>
        </div>
      </div>
    </div>
  );
}
