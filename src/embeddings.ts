import { GoogleGenAI } from '@google/genai'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CONFIG } from './config.js'

const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY })
let _supabase: SupabaseClient | null = null
function supabase(): SupabaseClient {
  if (_supabase) return _supabase
  _supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY)
  return _supabase
}

const EMBEDDING_MODEL = 'gemini-embedding-2-preview'
const DIMENSIONS = 768

/**
 * Genera embedding para un texto usando Gemini Embedding
 */
export async function embedText(
  text: string,
  taskType: string = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType: taskType as any,
      outputDimensionality: DIMENSIONS,
    },
  })

  return result.embeddings?.[0]?.values || []
}

/**
 * Contextual Retrieval: prepend contexto antes de embedear
 * Mejora la relevancia del embedding al incluir quién y de dónde
 */
export async function embedWithContext(
  content: string,
  contactName: string,
  phone: string
): Promise<number[]> {
  const context = `Mensaje de WhatsApp de ${contactName} (${phone}): ${content}`
  return embedText(context)
}

/**
 * Genera embedding y actualiza crm_messages
 * Diseñado para fire-and-forget después de logMessage()
 */
export async function embedAndStore(
  contactPhone: string,
  content: string,
  contactName: string
): Promise<void> {
  try {
    // No embedear mensajes muy cortos o vacíos
    if (!content || content.length < 10) return

    // Buscar el mensaje más reciente de este contacto
    const { data: message } = await supabase()
      .from('crm_messages')
      .select('id')
      .eq('contact_phone', contactPhone)
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    if (!message) return

    const embedding = await embedWithContext(content, contactName, contactPhone)
    if (!embedding.length) return

    // Formatear como string para pgvector: [0.1, 0.2, ...]
    const vectorStr = `[${embedding.join(',')}]`

    const { error } = await supabase()
      .from('crm_messages')
      .update({ embedding: vectorStr })
      .eq('id', message.id)

    if (error) {
      console.error('[embeddings] Error actualizando embedding:', error.message)
    }
  } catch (err) {
    console.error('[embeddings] Error:', err)
  }
}
