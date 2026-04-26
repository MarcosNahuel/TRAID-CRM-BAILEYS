import { config } from 'dotenv'
config()

export const CONFIG = {
  // CRM Supabase (existente, super-yo lo usa para memorias/mensajes/graph)
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || '',

  // YO Supabase (nuevo, dedicado al sistema yo — tasks, contacts)
  YO_SUPABASE_URL: process.env.YO_SUPABASE_URL || '',
  YO_SUPABASE_SERVICE_KEY: process.env.YO_SUPABASE_SERVICE_KEY || '',

  // Feature flag rollout pipeline yo
  YO_PIPELINE_ENABLED: process.env.YO_PIPELINE_ENABLED === 'true',

  // Lista de proyectos activos para classifier (CSV)
  YO_ACTIVE_PROJECTS: process.env.YO_ACTIVE_PROJECTS || '',

  // LLM
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Vertex AI (Service Account para classifier)
  GCP_VERTEX_SA_JSON_PATH: process.env.GCP_VERTEX_SA_JSON_PATH || '',
  GCP_VERTEX_PROJECT: process.env.GCP_VERTEX_PROJECT || '',
  GCP_VERTEX_LOCATION: process.env.GCP_VERTEX_LOCATION || 'us-central1',

  // Telegram (existente)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',

  // WA / contactos
  NACHO_PHONE: process.env.NACHO_PHONE || '',
  NAHUEL_PHONE: process.env.NAHUEL_PHONE || '',
  NAHUEL_WA_ID: process.env.NAHUEL_WA_ID || '5492617131433',

  // Sessions
  SESSIONS_DIR: process.env.SESSIONS_DIR || './sessions',
}
