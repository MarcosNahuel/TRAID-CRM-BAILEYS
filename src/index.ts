import { startSession, OnQRCallback } from './session.js'
import { CONFIG } from './config.js'
import { mkdir } from 'fs/promises'
import { createServer } from 'http'

// QR store para servir via HTTP
const qrStore: Record<string, string> = {}

const onQR: OnQRCallback = (sessionName, qrData) => {
  if (qrData) {
    qrStore[sessionName] = qrData
  } else {
    delete qrStore[sessionName]
  }
}

// Servidor HTTP para QR codes y health check
const server = createServer((req, res) => {
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
    <title>TRAID CRM — QR</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
      body{background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px}
      h1{color:#7c3aed} h2{color:#a78bfa}
      #status{color:#888;margin-bottom:20px}
      .qr-box{margin:30px;text-align:center;background:#1a1a1a;padding:30px;border-radius:12px}
    </style>
  </head><body>
    <h1>TRAID CRM — Vincular WhatsApp</h1>
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
            status.style.color = '#4ade80';
            container.innerHTML = '';
          } else {
            status.textContent = 'Escaneá cada QR con WhatsApp > Dispositivos vinculados';
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
                new QRCode(document.getElementById('qr-' + name), {text: data[name], width: 200, height: 200});
              }
            });
          }
        } catch(e) { console.error(e); }
      }
      refresh();
      setInterval(refresh, 10000);
    </script>
  </body></html>`)
})

const PORT = parseInt(process.env.QR_PORT || '3001')
server.listen(PORT, '0.0.0.0', () => {
  console.log(`QR Server en puerto ${PORT}`)
})

async function main() {
  console.log('TRAID CRM — WhatsApp Reader')
  console.log(`API: ${CONFIG.API_BASE_URL}`)
  console.log('')

  await mkdir(CONFIG.SESSIONS_DIR, { recursive: true })

  console.log('Iniciando sesión NACHO...')
  await startSession('nacho', CONFIG.NACHO_PHONE, onQR)

  console.log('Iniciando sesión NAHUEL...')
  await startSession('nahuel', CONFIG.NAHUEL_PHONE, onQR)

  console.log('Ambas sesiones iniciadas. Esperando mensajes...')
}

main().catch(console.error)
