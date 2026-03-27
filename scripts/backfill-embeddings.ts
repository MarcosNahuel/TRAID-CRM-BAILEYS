/**
 * backfill-embeddings.ts — Regenera embeddings para mensajes sin vector
 *
 * Usa @google/genai (v1) con text-embedding-004
 * Procesa en batches de 50, con rate limiting para no pegarle al API
 *
 * Uso: npx tsx scripts/backfill-embeddings.ts [--limit 500] [--phone 5492617502492]
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mamsytlfotlkiwtfqqlj.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbXN5dGxmb3Rsa2l3dGZxcWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTkxMzQsImV4cCI6MjA4NzI3NTEzNH0.VDF2dtOnldc4nivdKEPlw7zm_WyrlH1MlztohA70ld4'
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDMcZe4zZx-ozTHCxUiZi1X3oLdkTFnBBg'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY })

const BATCH_SIZE = 50
const DELAY_MS = 1500 // rate limit entre batches
const MODEL = 'gemini-embedding-2-preview'
const DIMS = 768

// Parse args
const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const phoneIdx = args.indexOf('--phone')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 2000
const PHONE_FILTER = phoneIdx >= 0 ? args[phoneIdx + 1] : null

async function embedText(text: string): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: MODEL,
    contents: text,
    config: { taskType: 'RETRIEVAL_DOCUMENT' as any, outputDimensionality: DIMS },
  })
  return result.embeddings?.[0]?.values || []
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log(`\n🔄 Backfill embeddings — limit=${LIMIT}, phone=${PHONE_FILTER || 'todos'}`)

  // Contar mensajes sin embedding
  let countQuery = supabase
    .from('crm_messages')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
    .not('content', 'is', null)
    .gt('content', '')  // no vacíos

  if (PHONE_FILTER) countQuery = countQuery.eq('contact_phone', PHONE_FILTER)

  const { count } = await countQuery
  console.log(`📊 Mensajes sin embedding: ${count}`)

  if (!count || count === 0) {
    console.log('✅ Todos los mensajes ya tienen embedding')
    return
  }

  let processed = 0
  let errors = 0
  let offset = 0

  while (processed < LIMIT) {
    // Fetch batch
    let query = supabase
      .from('crm_messages')
      .select('id, content, contact_phone')
      .is('embedding', null)
      .not('content', 'is', null)
      .order('received_at', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1)

    if (PHONE_FILTER) query = query.eq('contact_phone', PHONE_FILTER)

    const { data: messages, error } = await query

    if (error) {
      console.error('❌ Error fetch:', error.message)
      break
    }

    if (!messages || messages.length === 0) {
      console.log('✅ No hay más mensajes para procesar')
      break
    }

    // Procesar batch
    for (const msg of messages) {
      if (!msg.content || msg.content.length < 5) {
        offset++
        continue
      }

      try {
        const contextual = `Mensaje WhatsApp (${msg.contact_phone}): ${msg.content}`
        const embedding = await embedText(contextual)

        if (embedding.length > 0) {
          const vectorStr = `[${embedding.join(',')}]`
          const { error: updateErr } = await supabase
            .from('crm_messages')
            .update({ embedding: vectorStr })
            .eq('id', msg.id)

          if (updateErr) {
            console.error(`  ❌ Update ${msg.id}: ${updateErr.message}`)
            errors++
          } else {
            processed++
          }
        }
      } catch (err: any) {
        console.error(`  ❌ Embed ${msg.id}: ${err.message?.substring(0, 80)}`)
        errors++

        // Si es rate limit, esperar más
        if (err.message?.includes('429') || err.message?.includes('quota')) {
          console.log('  ⏳ Rate limited, esperando 10s...')
          await sleep(10000)
        }
      }
    }

    console.log(`  📦 Batch: +${messages.length} | Total: ${processed} OK, ${errors} errors`)

    if (processed >= LIMIT) break
    await sleep(DELAY_MS)
  }

  console.log(`\n✅ Backfill completo: ${processed} embeddings generados, ${errors} errores`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
