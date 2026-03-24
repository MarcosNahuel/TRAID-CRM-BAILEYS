/**
 * SUPER YO — Agente personal de Nahuel Albornoz
 *
 * Model cascade: Gemini -> OpenAI fallback
 * Tools: 16 herramientas (CRM, ghost writer, calendar, gmail)
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, stepCountIs } from 'ai'
import { checkGuardrails } from './middleware.js'
import { superYoTools } from './tools.js'
import { getSuperYoChatHistory, saveSuperYoMessage } from './crm-client.js'

const google = process.env.GEMINI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
  : process.env.GOOGLE_API_KEY
    ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
    : null

const openai = process.env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

const SUPER_YO_SYSTEM_PROMPT = `Sos el "Super Yo" de Nahuel Albornoz — su sistema operativo personal.

## IDENTIDAD DE NAHUEL (prompt de co-founder)

**Profesional**: Co-founder & PM de TRAID Agency. Referente en IA aplicada a e-commerce. Visionario práctico que ejecuta. Siempre conecta tecnología con impacto de negocio. Seguro, conciso, estratégico.
**Familia**: Natural, cariñoso, sin filtro de marca.
**Principio rector**: "No responder en caliente. Pausa estratégica siempre."

- AI Generative Engineer (Agentic Systems)
- Founder PymeInside (BI para PyMES), Asesor DGE Mendoza
- Stack: n8n, LangGraph, Supabase, Gemini, Claude Code
- Vive en Mendoza, Argentina. Hijo: Elian

## TRAID AGENCY
- TRAID-DATA (sync APIs, dashboards), TRAID-AI (agentes conversacionales, RAG), TRAID-OPS (workflows n8n)
- Clientes: HUANCOM (energías renovables), NG Artificiales (pesca), BAZAR (Chile), TiendaLubbi (autopartes), La Tinta (Chile)
- Garantía 45 días MVP o devolución

## SCOPES (compartimentalización)
Los datos de un scope NUNCA se mezclan con otro al responder:
- **traid**: Trabajo TRAID, clientes, proyectos, deals
- **pymeinside**: PymeInside, BI, datos
- **dge**: Dirección General de Escuelas, asesoría
- **family**: Familia, Elian, personal íntimo
- **personal**: Desarrollo personal, salud, gym, hábitos
- **health**: Médico, turnos, nutrición
- **friends**: Amigos, social

Si Nahuel pregunta por trabajo, NO mencionar info de familia. Si pregunta por familia, NO mencionar clientes.

## SISTEMA DE 3 VOCES (Ghost Writer)

### Voz EJECUTOR
- Directo, 1-2 oraciones, acción pura
- "Dale, lo hago hoy." / "Listo, te paso el presupuesto mañana."

### Voz VISIONARIO PRÁCTICO
- Conecta lo técnico con impacto de negocio
- "Esto nos posiciona como los únicos que hacen X en LATAM. Te mando demo el jueves."

### Voz NATURAL
- Familia, sin filtro de marca
- "Joya pa, paso a las 8. Querés que lleve algo?"

## REGLAS DE VOZ POR CONTACTO
| Contacto | Voz default | Override |
|----------|-------------|---------|
| Nacho (socio) | Visionario | Ejecutor cuando hay mucho laburo |
| Sebastián Peña | Ejecutor en semana | Visionario fines de semana |
| Cecilia Cejas | Ejecutor siempre | — |
| Grupos dev | Ejecutor siempre | — |
| Clientes/leads | Visionario práctico | — |
| Familia | Natural | — |
| Contacto nuevo sin regla | Pregunta a Nahuel qué voz usar | — |

IMPORTANTE: Antes de sugerir una respuesta:
1. Buscar la voz configurada del contacto
2. Buscar reglas especiales del contacto
3. Buscar objetivo activo
4. Aplicar voz + reglas + objetivo al draft

## OBJETIVOS POR CONTACTO
Los objetivos guían todas las sugerencias del ghost writer.

## FILOSOFÍA ESTOICA
Cuando detectes carga emocional alta:
1. **Dicotomía del control**: ¿Depende de Nahuel o no?
2. **Perspectiva temporal**: ¿Importará en 1 semana? ¿1 mes?
3. **Virtud sobre emoción**: Acción correcta
4. **Pausa estratégica**: Si la emoción es alta, sugerir esperar

Para ghost-writing con carga emocional, ofrecer 3 opciones:
- A) Silencio estratégico
- B) Neutro mínimo
- C) Respuesta firme sin emoción

## FORMATO
- Respuestas cortas y directas para WhatsApp
- NO digas "Voy a usar la herramienta X..." — simplemente usala y respondé
- Si sugerís un draft, formatealo entre comillas
- Emoji moderado, solo cuando agrega valor`

/**
 * Generar respuesta del Super Yo
 */
export async function generateSuperYoResponse({
  mensaje,
  tipo = 'text',
  wa_id,
}: {
  mensaje: string
  tipo?: 'text' | 'audio' | 'image' | 'document'
  wa_id?: string
}) {
  const history = await getSuperYoChatHistory(20)

  const messages = [
    ...history.map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    {
      role: 'user' as const,
      content: tipo === 'text' ? mensaje : `[${tipo.toUpperCase()}]: ${mensaje}`,
    },
  ]

  const startTime = Date.now()

  if (!google && !openai) {
    throw new Error('No AI provider configured (GEMINI_API_KEY or OPENAI_API_KEY)')
  }

  const dynamicContext = `\nFecha actual: ${new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
  const systemPrompt = SUPER_YO_SYSTEM_PROMPT + dynamicContext

  type ModelEntry = { id: string; provider: string; model: any }
  const modelCascade: ModelEntry[] = [
    ...(google
      ? [
          {
            id: 'gemini-2.5-flash',
            provider: 'google',
            model: google('gemini-2.5-flash'),
          },
        ]
      : []),
    ...(openai
      ? [
          {
            id: 'gpt-4o',
            provider: 'openai',
            model: openai('gpt-4o'),
          },
        ]
      : []),
  ]

  for (let i = 0; i < modelCascade.length; i++) {
    const { id: modelId, provider, model } = modelCascade[i]
    try {
      console.log(`[super-yo] Intentando ${provider}/${modelId}...`)
      const result = await generateText({
        model,
        system: systemPrompt,
        messages,
        tools: superYoTools,
        stopWhen: stepCountIs(10),
      })

      let finalText = result.text
      if (finalText) checkGuardrails(finalText)
      if (!finalText?.trim() && result.steps && result.steps.length > 0) {
        const toolSummary = result.steps
          .flatMap((s: any) => s.toolResults || [])
          .map((tr: any) => tr.result?.message || '')
          .filter(Boolean)
          .join('; ')
        finalText = toolSummary || 'Listo, procesado.'
      }

      const toolsUsed =
        result.steps
          ?.flatMap((s: any) => s.toolCalls || [])
          .map((tc: any) => tc.toolName)
          .filter(Boolean) || []

      const latency = Date.now() - startTime
      console.log(
        `[super-yo] ${modelId}: ${latency}ms, ${toolsUsed.length} tools, ${result.usage?.totalTokens || 0} tokens`
      )

      await saveSuperYoMessage('user', mensaje)
      await saveSuperYoMessage('assistant', finalText, {
        tools_used: toolsUsed,
        model: modelId,
        tokens_used: result.usage?.totalTokens,
      })

      return {
        respuesta: finalText,
        tools_used: toolsUsed,
        usage: result.usage,
      }
    } catch (err: any) {
      console.error(
        `[super-yo] ${provider}/${modelId} falló:`,
        err.message?.substring(0, 200)
      )
      if (i === modelCascade.length - 1) {
        throw new Error(`Todos los modelos fallaron. Último: ${err.message}`)
      }
    }
  }

  throw new Error('No hay modelos de IA disponibles')
}
