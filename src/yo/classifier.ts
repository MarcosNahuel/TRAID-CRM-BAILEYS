/**
 * Sistema yo — Vertex AI classifier
 *
 * Clasifica un mensaje libre contra una lista de project_slugs candidatos
 * y devuelve el más probable con un score de confianza.
 *
 * Auth: Service Account via GCP_VERTEX_SA_JSON_PATH (keyFile).
 * Modelo: gemini-2.5-flash sobre Vertex AI (apiVersion v1).
 *
 * Plan: D:/Proyectos/CONOCIMIENTO-NAHUEL/plan/26-04/sistema-yo-session-1-plan.md (Task 4)
 */

import type { ClassifyResult } from './types.js'

const MODEL = 'gemini-2.5-flash'

// Lazy-load del SDK: así el módulo se puede importar sin tener instalado
// `@google/genai` (útil para unit tests que no tocan la API).
let cachedClient: unknown = null

async function getClient(): Promise<{
  models: {
    generateContent: (req: unknown) => Promise<{ text?: string }>
  }
}> {
  if (cachedClient) {
    return cachedClient as {
      models: {
        generateContent: (req: unknown) => Promise<{ text?: string }>
      }
    }
  }

  const project = process.env.GCP_VERTEX_PROJECT
  const location = process.env.GCP_VERTEX_LOCATION
  const keyFile = process.env.GCP_VERTEX_SA_JSON_PATH

  if (!project || !location) {
    throw new Error(
      '[yo/classifier] Faltan envs: GCP_VERTEX_PROJECT y GCP_VERTEX_LOCATION son obligatorios',
    )
  }
  if (!keyFile) {
    throw new Error(
      '[yo/classifier] Falta GCP_VERTEX_SA_JSON_PATH (path al service account JSON)',
    )
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
  return cachedClient as {
    models: {
      generateContent: (req: unknown) => Promise<{ text?: string }>
    }
  }
}

function buildSystemPrompt(candidates: string[]): string {
  return [
    'Sos un clasificador determinístico de mensajes de WhatsApp para un sistema de gestión de tareas personales.',
    'Tu tarea: dado un mensaje libre, decidir a cuál de los siguientes project_slug pertenece.',
    '',
    'Candidatos válidos:',
    ...candidates.map((c) => `- ${c}`),
    '',
    'Reglas:',
    '1. Devolvé EXACTAMENTE un JSON con esta forma: {"project_slug": "<uno-de-los-candidatos-o-null>", "confidence": <0..1>}',
    '2. Si ningún candidato encaja con razonable certeza, devolvé project_slug:null y confidence baja.',
    '3. confidence ∈ [0,1] — usá 0.9+ sólo si hay mención explícita o indicio fortísimo.',
    '4. NO agregues comentarios, prosa, ni texto fuera del JSON.',
  ].join('\n')
}

function safeParse(text: string): { project_slug: unknown; confidence: unknown } | null {
  if (!text) return null
  // Limpiar posibles fences ```json ... ```
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fallback: extraer primer bloque {...}
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/**
 * Clasifica un texto contra una lista de candidatos.
 * - Si candidates está vacío, retorna defaults sin invocar la API.
 * - Si el slug devuelto no está en candidates, se anula (project_slug:null).
 * - confidence siempre clamp [0,1].
 */
export async function classifyMessage(
  text: string,
  candidates: string[],
): Promise<ClassifyResult> {
  if (!candidates || candidates.length === 0) {
    return { project_slug: null, confidence: 0 }
  }

  const ai = await getClient()

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [{ text: `Mensaje:\n${text}` }],
      },
    ],
    config: {
      systemInstruction: buildSystemPrompt(candidates),
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })

  const rawText = response.text ?? ''
  const parsed = safeParse(rawText)

  if (!parsed) {
    return { project_slug: null, confidence: 0, raw: rawText }
  }

  const slugRaw = parsed.project_slug
  const slug =
    typeof slugRaw === 'string' && candidates.includes(slugRaw) ? slugRaw : null

  const confRaw =
    typeof parsed.confidence === 'number'
      ? parsed.confidence
      : Number(parsed.confidence)
  const confidence = slug ? clamp01(confRaw) : 0

  return { project_slug: slug, confidence, raw: parsed }
}
