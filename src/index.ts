import { startSession, OnQRCallback } from './session.js'
import { CONFIG } from './config.js'
import { mkdir } from 'fs/promises'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { handleWebhookRequest } from './webhook-router.js'
import { handleCerebroRequest } from './segundo-cerebro/api.js'

// QR store para servir via HTTP
const qrStore: Record<string, string> = {}

const onQR: OnQRCallback = (sessionName, qrData) => {
  if (qrData) {
    qrStore[sessionName] = qrData
  } else {
    delete qrStore[sessionName]
  }
}

// Servidor HTTP para QR codes, health check, y webhook Meta
const server = createServer(async (req, res) => {
  // API Segundo Cerebro
  const cerebroHandled = await handleCerebroRequest(req, res)
  if (cerebroHandled) return

  // Webhook Meta (Super Yo via WhatsApp Cloud API)
  const handled = await handleWebhookRequest(req, res)
  if (handled) return

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      sessions: Object.keys(qrStore).length === 0 ? 'connected' : 'pending',
      providers: {
        vertex: !!(process.env.GCP_VERTEX_PROJECT && process.env.GCP_VERTEX_SA_JSON),
        google: !!process.env.GEMINI_API_KEY,
        openai: !!process.env.OPENAI_API_KEY,
      },
      model: process.env.SUPERYO_GEMINI_MODEL || 'gemini-2.5-flash',
      build_id: '2026-04-27-vertex-primary-debug',
    }))
    return
  }
  if (req.url === '/debug-agent') {
    try {
      const { generateSuperYoResponse } = await import('./super-yo/agent.js')
      const r = await generateSuperYoResponse({
        mensaje: 'Decí solo OK. Sin llamar herramientas.',
        tipo: 'text',
        wa_id: '5492615181225',
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, reply: r.respuesta?.slice(0, 300), tools_used: r.tools_used }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: false,
        error: (err as Error).message?.slice(0, 800),
        stack: (err as Error).stack?.slice(0, 1500),
      }))
    }
    return
  }
  if (req.url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(qrStore))
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Super Yo — QR</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
      body{background:#fff;color:#222;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;padding:20px}
      h1{color:#7c3aed;font-size:1.3em}
      #status{color:#666;margin-bottom:10px}
      .qr-box{margin:15px;text-align:center}
      .qr-box h2{font-size:1em;color:#333;margin-bottom:8px}
      canvas{border:4px solid #000;border-radius:8px}
    </style>
  </head><body>
    <h1>Super Yo</h1>
    <p id="status">Cargando...</p>
    <div id="qrs"></div>
    <script>
      const rendered = {};
      async function refresh() {
        try {
          const data = await fetch('/qr').then(r => r.json());
          const keys = Object.keys(data);
          const container = document.getElementById('qrs');
          const status = document.getElementById('status');
          if (keys.length === 0) {
            status.textContent = 'Todas las sesiones conectadas';
            status.style.color = '#16a34a';
            container.innerHTML = '';
          } else {
            status.textContent = 'Escaneá con WhatsApp > Dispositivos vinculados';
            keys.forEach(name => {
              if (!rendered[name] || rendered[name] !== data[name]) {
                rendered[name] = data[name];
                let box = document.getElementById('box-' + name);
                if (!box) {
                  box = document.createElement('div');
                  box.id = 'box-' + name;
                  box.className = 'qr-box';
                  box.innerHTML = '<h2>' + name.toUpperCase() + '</h2><div id="qr-' + name + '"></div>';
                  container.appendChild(box);
                } else {
                  document.getElementById('qr-' + name).innerHTML = '';
                }
                new QRCode(document.getElementById('qr-' + name), {text: data[name], width: 260, height: 260, correctLevel: QRCode.CorrectLevel.L});
              }
            });
          }
        } catch(e) { console.error(e); }
      }
      refresh();
      setInterval(refresh, 8000);
    </script>
  </body></html>`)
})

const PORT = parseInt(process.env.QR_PORT || '3001')
server.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Server en puerto ${PORT}`)
})

// Resiliencia top-level: en Dokploy/containers minimal, evitar exit por
// errores en libs externas (Baileys reconnect, fetch wa version, etc).
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})

async function main() {
  console.log('Super Yo — WhatsApp Reader + Agent')
  console.log(`Supabase CRM: ${CONFIG.SUPABASE_URL ? 'conectado' : 'no configurado'}`)
  console.log(`Supabase yo:  ${CONFIG.YO_SUPABASE_URL ? 'conectado' : 'no configurado'}`)
  console.log(`Pipeline yo:  ${CONFIG.YO_PIPELINE_ENABLED ? 'ON' : 'OFF'}`)
  console.log('')

  try {
    await mkdir(CONFIG.SESSIONS_DIR, { recursive: true })
  } catch (e) {
    console.error('[main] mkdir sessions dir:', e)
  }

  // WHATSAPP_ENABLED=false permite arrancar el servicio sin Baileys
  // (útil en deploys donde solo se usa el webhook Meta o el pipeline yo).
  const waEnabled = true // workaround: Dokploy swarm bug ignora env updates — forzar ON
  if (!waEnabled) {
    console.log('WHATSAPP_ENABLED=false → Baileys session deshabilitada')
    return
  }

  try {
    console.log('Iniciando sesión NAHUEL...')
    await startSession('nahuel', CONFIG.NAHUEL_PHONE, onQR)
    console.log('Sesión iniciada. Esperando mensajes...')
  } catch (err) {
    console.error('[main] startSession falló (no fatal):', err)
  }
}

main().catch((err) => {
  console.error('[main] error fatal capturado:', err)
})
// Force rebuild 1777413159
