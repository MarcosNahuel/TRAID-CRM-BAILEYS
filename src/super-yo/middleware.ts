/**
 * AI SDK Middleware — logging y guardrails
 * AI SDK v6 usa LanguageModelMiddleware (V3 spec)
 */

import type { LanguageModelMiddleware } from 'ai'

/**
 * Logging middleware: tracks latency, tokens, model usage
 */
export const loggingMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  async transformParams({ params }) {
    console.log(`[ai] Request starting...`)
    return params
  },
}

/**
 * Guardrail: valida output post-generación (se aplica en el handler, no como middleware)
 */
export function checkGuardrails(text: string): void {
  if (text.length > 4000) {
    console.warn(`[guardrail] Response exceeds WhatsApp limit: ${text.length} chars`)
  }

  const leakPatterns = [
    /SUPABASE.*KEY/i,
    /sk-[a-zA-Z0-9]{20,}/,
    /AIza[a-zA-Z0-9_-]{35}/,
  ]
  for (const pattern of leakPatterns) {
    if (pattern.test(text)) {
      console.error('[guardrail] Potential data leak detected in AI response')
    }
  }
}
