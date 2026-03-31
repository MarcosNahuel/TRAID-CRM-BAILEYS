/**
 * Segundo Cerebro — Orquestador Claude Agent SDK
 *
 * Usa Claude Code como agente con tools custom MCP (Supabase)
 * + herramientas built-in (Read, Glob, Grep, WebSearch, WebFetch)
 */

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { createSuperyoDataServer } from './tools.js'
import {
  SEGUNDO_CEREBRO_SYSTEM_PROMPT,
  DAILY_BRIEF_PROMPT,
} from './prompts.js'

/**
 * Procesar una consulta al segundo cerebro
 */
export async function processQuery(prompt: string): Promise<string> {
  console.log(`[segundo-cerebro] Query: ${prompt.substring(0, 100)}...`)
  const startTime = Date.now()

  try {
    const superyoDataServer = createSuperyoDataServer()

    const conversation = query({
      prompt,
      options: {
        systemPrompt: SEGUNDO_CEREBRO_SYSTEM_PROMPT,
        model: 'sonnet',
        maxTurns: 20,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        tools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash'],
        allowedTools: [
          'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash',
          'mcp__superyo-data__read_whatsapp_messages',
          'mcp__superyo-data__read_memories',
          'mcp__superyo-data__read_contacts',
          'mcp__superyo-data__search_knowledge',
          'mcp__superyo-data__read_metrics',
        ],
        mcpServers: {
          'superyo-data': superyoDataServer,
        },
        cwd: process.cwd(),
      },
    })

    let resultText = ''

    for await (const message of conversation) {
      if (message.type === 'result') {
        const result = message as Extract<SDKMessage, { type: 'result' }>
        resultText = (result as any).result || ''

        const duration = Date.now() - startTime
        const cost = (result as any).total_cost_usd || 0
        const turns = (result as any).num_turns || 0
        console.log(
          `[segundo-cerebro] Completado en ${duration}ms | ${turns} turns | $${cost.toFixed(4)}`
        )
      }
    }

    if (!resultText) {
      return 'No pude generar una respuesta. Intentá de nuevo.'
    }

    return resultText
  } catch (error: any) {
    console.error('[segundo-cerebro] Error:', error.message || error)
    return `Error del segundo cerebro: ${error.message || 'desconocido'}`
  }
}

/**
 * Generar brief diario
 */
export async function dailyBrief(): Promise<string> {
  console.log('[segundo-cerebro] Generando daily brief...')
  return processQuery(DAILY_BRIEF_PROMPT)
}
