import { config } from 'dotenv'
config()

export const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  NACHO_PHONE: process.env.NACHO_PHONE || '',
  NAHUEL_PHONE: process.env.NAHUEL_PHONE || '',
  SESSIONS_DIR: './sessions',
}
