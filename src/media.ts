import { GoogleGenAI } from '@google/genai'
import { CONFIG } from './config.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const MODEL = 'gemini-2.5-flash'

function ensureAdc(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return true
  }
  // Prioridad: SA_JSON_B64 (recomendado, evita issues de escaping en env vars) > SA_JSON inline > SA_JSON_PATH archivo
  const b64 = process.env.GCP_VERTEX_SA_JSON_B64
  const inlineJson = process.env.GCP_VERTEX_SA_JSON
  if (b64) {
    const decoded = Buffer.from(b64, 'base64').toString('utf-8')
    const tmpPath = path.join(os.tmpdir(), 'gcp-sa-media.json')
    fs.writeFileSync(tmpPath, decoded, { mode: 0o600 })
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath
    return true
  }
  if (inlineJson) {
    const tmpPath = path.join(os.tmpdir(), 'gcp-sa-media.json')
    fs.writeFileSync(tmpPath, inlineJson, { mode: 0o600 })
    process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath
    return true
  }
  if (CONFIG.GCP_VERTEX_SA_JSON_PATH && fs.existsSync(CONFIG.GCP_VERTEX_SA_JSON_PATH)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = CONFIG.GCP_VERTEX_SA_JSON_PATH
    return true
  }
  return false
}

const ai: GoogleGenAI | null = (() => {
  if (!CONFIG.GCP_VERTEX_PROJECT) {
    console.warn('[media] GCP_VERTEX_PROJECT no configurado — Gemini deshabilitado')
    return null
  }
  if (!ensureAdc()) {
    console.warn('[media] ADC no resuelto (setear GCP_VERTEX_SA_JSON_B64 o GCP_VERTEX_SA_JSON o GCP_VERTEX_SA_JSON_PATH) — Gemini deshabilitado')
    return null
  }
  return new GoogleGenAI({
    vertexai: true,
    project: CONFIG.GCP_VERTEX_PROJECT,
    location: CONFIG.GCP_VERTEX_LOCATION,
  })
})()

export async function transcribeAudio(buffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string> {
  if (!ai) return '[Audio - Vertex AI no configurada]'

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: 'Transcribi este audio de WhatsApp en español. Solo devolvé la transcripción, sin comentarios adicionales.' },
        ],
      }],
    })
    return response.text ?? '[Audio - sin transcripción]'
  } catch (err: any) {
    console.error('[media] Error transcribiendo audio:', err?.message || err)
    return `[Audio - error al transcribir: ${err?.message?.slice(0, 80) || 'desconocido'}]`
  }
}

export async function describeImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (!ai) return '[Imagen - Vertex AI no configurada]'

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: 'Describi esta imagen en español de forma concisa (1-2 oraciones). Contexto: mensaje de WhatsApp.' },
        ],
      }],
    })
    return response.text ?? '[Imagen - sin descripción]'
  } catch (err: any) {
    console.error('[media] Error describiendo imagen:', err?.message || err)
    return `[Imagen - error al procesar: ${err?.message?.slice(0, 80) || 'desconocido'}]`
  }
}

export async function analyzeDocument(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  if (!ai) return `[Documento: ${fileName} - Vertex AI no configurada]`

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: buffer.toString('base64') } },
          { text: `Analizá este documento "${fileName}" enviado por WhatsApp. Extraé:
1. Tipo de documento (factura, presupuesto, contrato, informe, etc.)
2. Resumen del contenido (máximo 3 oraciones)
3. Datos clave (montos, fechas, nombres, empresas)
4. Si hay algo que requiera acción

Respondé en español, conciso y directo.` },
        ],
      }],
    })
    return response.text ?? `[Documento: ${fileName} - sin análisis]`
  } catch (err: any) {
    console.error('[media] Error analizando documento:', err?.message || err)
    return `[Documento: ${fileName} - error al analizar: ${err?.message?.slice(0, 80) || 'desconocido'}]`
  }
}
