/**
 * Handler de mensajes Super Yo
 *
 * Orquesta el flujo cuando Nahuel escribe a Vittoria:
 * 1. Detecta que es Nahuel (por wa_id)
 * 2. Llama al agente Super Yo
 * 3. Envía respuesta por WhatsApp Cloud API
 */

import { generateSuperYoResponse } from './agent.js'
import {
  sendTextMessage,
  sendTypingIndicator,
  prepareForWhatsApp,
} from '../whatsapp-api.js'
import {
  processQuery as cerebroQuery,
  dailyBrief,
} from '../segundo-cerebro/brain.js'

export const NAHUEL_WA_ID = process.env.NAHUEL_WA_ID || '5492617131433'

/**
 * Detecta si el mensaje es para el segundo cerebro
 * Retorna el prompt extraído o null si no aplica
 */
export function detectCerebroCommand(text: string): { type: 'cerebro'; prompt: string } | { type: 'brief' } | null {
  const trimmed = text.trim().toLowerCase()

  // Detectar "brief" o "/brief"
  if (trimmed === 'brief' || trimmed === '/brief') {
    return { type: 'brief' }
  }

  // Detectar "cerebro X" o "/cerebro X"
  const cerebroMatch = text.trim().match(/^\/?\s*cerebro\s+(.+)/is)
  if (cerebroMatch) {
    return { type: 'cerebro', prompt: cerebroMatch[1].trim() }
  }

  return null
}

/**
 * Procesar mensaje de Nahuel en modo Super Yo
 */
export async function processSuperYoMessage(
  waId: string,
  processedMessages: Array<{ tipo: string; contenido: string }>
) {
  try {
    let mensajesCombinados = processedMessages
      .map((m) => m.contenido)
      .join('\n')
      .trim()

    if (!mensajesCombinados) return

    const tipo =
      processedMessages.find((m) => m.tipo !== 'text')?.tipo || 'text'

    console.log(
      `[super-yo] Procesando mensaje de Nahuel: ${mensajesCombinados.substring(0, 100)}...`
    )

    try {
      await sendTypingIndicator(waId)
    } catch {}

    // Detectar si es comando del segundo cerebro
    const cerebroCmd = detectCerebroCommand(mensajesCombinados)

    if (cerebroCmd) {
      console.log(`[super-yo] Redirigiendo a segundo cerebro (${cerebroCmd.type})`)

      let respuesta: string
      if (cerebroCmd.type === 'brief') {
        respuesta = await dailyBrief()
      } else {
        respuesta = await cerebroQuery(cerebroCmd.prompt)
      }

      if (respuesta) {
        const chunks = prepareForWhatsApp(respuesta)
        for (const chunk of chunks) {
          await sendTextMessage({ to: waId, text: chunk })
        }
        console.log(
          `[super-yo] Respuesta segundo cerebro enviada (${chunks.length} chunks)`
        )
      }
      return
    }

    // Flujo normal: Gemini Super Yo
    const { respuesta, tools_used } = await generateSuperYoResponse({
      mensaje: mensajesCombinados,
      tipo: tipo as 'text' | 'audio' | 'image' | 'document',
      wa_id: waId,
    })

    if (respuesta) {
      const chunks = prepareForWhatsApp(respuesta)
      for (const chunk of chunks) {
        await sendTextMessage({ to: waId, text: chunk })
      }
      console.log(
        `[super-yo] Respuesta enviada (${chunks.length} chunks, tools: ${tools_used.join(', ') || 'ninguno'})`
      )
    }
  } catch (error) {
    console.error('[super-yo] Error:', error)
    try {
      await sendTextMessage({
        to: waId,
        text: 'Error procesando. Intentá de nuevo.',
      })
    } catch {}
  }
}
