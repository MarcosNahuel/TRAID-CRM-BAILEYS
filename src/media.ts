import { GoogleGenerativeAI } from '@google/generative-ai'
import { CONFIG } from './config.js'

const genAI = CONFIG.GEMINI_API_KEY
  ? new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)
  : null

export async function transcribeAudio(buffer: Buffer): Promise<string> {
  if (!genAI) return '[Audio - Gemini API no configurada]'

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const base64 = buffer.toString('base64')

  const result = await model.generateContent([
    { inlineData: { mimeType: 'audio/ogg', data: base64 } },
    'Transcribi este audio de WhatsApp en espanol. Solo devolvé la transcripción, sin comentarios adicionales.',
  ])

  return result.response.text()
}

export async function describeImage(buffer: Buffer, mimeType: string): Promise<string> {
  if (!genAI) return '[Imagen - Gemini API no configurada]'

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const base64 = buffer.toString('base64')

  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64 } },
    'Describi esta imagen en espanol de forma concisa (1-2 oraciones). Contexto: mensaje de WhatsApp.',
  ])

  return result.response.text()
}

export async function analyzeDocument(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  if (!genAI) return `[Documento: ${fileName} - Gemini API no configurada]`

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const base64 = buffer.toString('base64')

  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64 } },
    `Analizá este documento "${fileName}" enviado por WhatsApp. Extraé:
1. Tipo de documento (factura, presupuesto, contrato, informe, etc.)
2. Resumen del contenido (máximo 3 oraciones)
3. Datos clave (montos, fechas, nombres, empresas)
4. Si hay algo que requiera acción

Respondé en español, conciso y directo.`,
  ])

  return result.response.text()
}
