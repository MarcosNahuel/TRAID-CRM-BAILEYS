import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Cargar .env manualmente antes de correr tests
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (val && !process.env[key]) {
      process.env[key] = val
    }
  }
}
