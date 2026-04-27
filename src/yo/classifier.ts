/**
 * Sistema yo — Vertex AI classifier multimodal (texto + audio).
 *
 * Auth: Service Account via GCP_VERTEX_SA_JSON (inline) o GCP_VERTEX_SA_JSON_PATH (file).
 * Modelo: gemini-2.5-flash sobre Vertex AI (apiVersion v1).
 * Soporta audio inline ≤20MB (Vertex limit). Para mayor, usar GCS URI (futuro).
 */

import type { ClassifyInput, ClassifyResult, Priority, TaskType } from './types.js'

const MODEL = 'gemini-2.5-flash'

let cachedClient: unknown = null

async function getClient(): Promise<{
  models: { generateContent: (req: unknown) => Promise<{ text?: string }> }
}> {
  if (cachedClient) return cachedClient as never

  const project = process.env.GCP_VERTEX_PROJECT
  const location = process.env.GCP_VERTEX_LOCATION
  let keyFile = process.env.GCP_VERTEX_SA_JSON_PATH
  const inlineSa = process.env.GCP_VERTEX_SA_JSON

  if (!project || !location) {
    throw new Error('[yo/classifier] Faltan envs GCP_VERTEX_PROJECT y GCP_VERTEX_LOCATION')
  }

  if (!keyFile && inlineSa) {
    const { writeFileSync, existsSync, mkdirSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const dir = join(tmpdir(), 'yo-sa')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    keyFile = join(dir, 'vertex-sa.json')
    writeFileSync(keyFile, inlineSa, { encoding: 'utf-8', mode: 0o600 })
  }

  if (!keyFile) {
    throw new Error('[yo/classifier] Falta GCP_VERTEX_SA_JSON o GCP_VERTEX_SA_JSON_PATH')
  }

  const { GoogleGenAI } = await import('@google/genai')
  cachedClient = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    apiVersion: 'v1',
    googleAuthOptions: {
      keyFile,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    },
  })
  return cachedClient as never
}

function buildSystemPrompt(candidates: string[]): string {
  return [
    'Sos un clasificador de mensajes para un sistema de tareas personales.',
    'Dado un mensaje (texto o transcripción de audio), clasificá contra los candidatos y devolvé schema JSON estricto.',
    '',
    'Candidatos válidos para project_slug:',
    ...candidates.map((c) => `- ${c}`),
    '- personal  (fallback explícito si nada encaja con confianza)',
    '',
    'Devolvé EXACTAMENTE este JSON:',
    '{',
    '  "project_slug": "<uno-de-candidatos-o-personal>",',
    '  "confidence": <0..1>,',
    '  "priority": "low|medium|high|urgent",',
    '  "task_type": "task|info|decision|blocker|memory",',
    '  "due_at": "<ISO 8601 o null>",',
    '  "estimated_minutes": <int o null>,',
    '  "tags": [<máx 4 strings cortos en kebab-case>]',
    '}',
    '',
    'Reglas:',
    '- confidence 0.9+ solo si hay mención EXPLÍCITA del proyecto.',
    '- Si nada encaja con confidence ≥0.5, devolvé project_slug=\'personal\' con confidence baja.',
    '- priority \'urgent\' solo si hay deadline explícito <24h.',
    '- task_type \'memory\' si el mensaje es información a recordar (no una acción).',
    '- NO agregues prosa fuera del JSON.',
  ].join('\n')
}

function safeParse(text: string): Record<string, unknown> | null {
  if (!text) return null
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      return JSON.parse(m[0])
    } catch {
      return null
    }
  }
}

function clamp01(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

const VALID_PRIO: Priority[] = ['low', 'medium', 'high', 'urgent']
const VALID_TYPE: TaskType[] = ['task', 'info', 'decision', 'blocker', 'memory']

function normalizePriority(v: unknown): Priority {
  return typeof v === 'string' && (VALID_PRIO as string[]).includes(v) ? (v as Priority) : 'medium'
}
function normalizeTaskType(v: unknown): TaskType {
  return typeof v === 'string' && (VALID_TYPE as string[]).includes(v) ? (v as TaskType) : 'task'
}

/**
 * Classifier multimodal — texto y/o audio inline.
 * Si ningún candidate matchea con confidence ≥0.5, retorna project_slug='personal'.
 */
export async function classifyMultimodal(input: ClassifyInput): Promise<ClassifyResult> {
  const { text, audioBase64, audioMimeType, candidates } = input

  if (!text && !audioBase64) {
    throw new Error('classifyMultimodal: provide text or audio')
  }
  if (!candidates || candidates.length === 0) {
    return { project_slug: null, confidence: 0 }
  }

  const ai = await getClient()
  const parts: unknown[] = []
  if (text) parts.push({ text: `Mensaje:\n${text}` })
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: audioMimeType || 'audio/ogg',
        data: audioBase64,
      },
    })
    if (!text) parts.push({ text: 'Transcribí el audio mentalmente y clasificá.' })
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: buildSystemPrompt(candidates),
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })

  const rawText = response.text ?? ''
  const parsed = safeParse(rawText)
  if (!parsed) return { project_slug: 'personal', confidence: 0, raw: rawText }

  const slugRaw = parsed.project_slug
  const allowed = [...candidates, 'personal']
  const slug =
    typeof slugRaw === 'string' && allowed.includes(slugRaw) ? slugRaw : 'personal'

  const confidence = clamp01(parsed.confidence)
  const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : []
  const tags = tagsRaw.filter((t: unknown) => typeof t === 'string').slice(0, 4) as string[]

  return {
    project_slug: slug,
    confidence,
    priority: normalizePriority(parsed.priority),
    task_type: normalizeTaskType(parsed.task_type),
    due_at: typeof parsed.due_at === 'string' ? parsed.due_at : null,
    estimated_minutes:
      typeof parsed.estimated_minutes === 'number' ? parsed.estimated_minutes : null,
    tags,
    raw: parsed,
  }
}

/**
 * Compat: API antigua text-only. Delega a classifyMultimodal.
 */
export async function classifyMessage(text: string, candidates: string[]): Promise<ClassifyResult> {
  return classifyMultimodal({ text, candidates })
}
