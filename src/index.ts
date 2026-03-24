import { startSession, OnQRCallback } from './session.js'
import { CONFIG } from './config.js'
import { mkdir } from 'fs/promises'
import { createServer } from 'http'
import { handleWebhookRequest } from './webhook-router.js'

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
  // Webhook Meta (Super Yo via WhatsApp Cloud API)
  const handled = await handleWebhookRequest(req, res)
  if (handled) return

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', sessions: Object.keys(qrStore).length === 0 ? 'connected' : 'pending' }))
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

async function main() {
  console.log('Super Yo — WhatsApp Reader + Agent')
  console.log(`Supabase: ${CONFIG.SUPABASE_URL ? 'conectado' : 'no configurado'}`)
  console.log('')

  await mkdir(CONFIG.SESSIONS_DIR, { recursive: true })

  console.log('Iniciando sesión NAHUEL...')
  await startSession('nahuel', CONFIG.NAHUEL_PHONE, onQR)

  console.log('Sesión iniciada. Esperando mensajes...')
}

main().catch(console.error)
