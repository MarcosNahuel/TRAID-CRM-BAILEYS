import { config } from 'dotenv'
config()

export const CONFIG = {
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  NACHO_PHONE: process.env.NACHO_PHONE || '',
  NAHUEL_PHONE: process.env.NAHUEL_PHONE || '',
  SESSIONS_DIR: './sessions',
}
