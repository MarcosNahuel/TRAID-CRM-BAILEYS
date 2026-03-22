# TRAID CRM — WhatsApp Reader

Servicio Node.js que lee mensajes de WhatsApp usando Baileys y los registra en el CRM de TRAID. Soporta dos sesiones simultáneas (Nacho + Nahuel).

**SOLO LECTURA** — Este servicio nunca envía mensajes. Solo escucha y registra.

## Funcionalidades

- Lectura de mensajes de WhatsApp en tiempo real (2 sesiones)
- Detección automática de códigos de atribución: `(VID-042)`, `(IG-015)`, `(TT-003)`
- Transcripción de audios con Gemini 2.0 Flash
- Descripción de imágenes con Gemini 2.0 Flash
- Registro automático de leads y mensajes en TRAID-ERP API

## Setup

1. Instalar dependencias:

```bash
npm install
```

2. Copiar `.env.example` a `.env` y configurar:

```bash
cp .env.example .env
```

Variables:

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `API_BASE_URL` | URL de la API de TRAID-ERP | `https://traid-erp.vercel.app` |
| `GEMINI_API_KEY` | API key de Google Gemini | `AIza...` |
| `WA_PHONE` | Teléfono para links wa.me | `5492612345678` |

## Primera ejecución

```bash
npm run dev
```

Al iniciar, se muestran dos QR codes en la terminal (uno por sesión):

1. **Sesión NACHO**: Escanear con el WhatsApp de Nacho
2. **Sesión NAHUEL**: Escanear con el WhatsApp de Nahuel

Las credenciales se guardan en `sessions/` y no es necesario volver a escanear mientras la sesión no se cierre.

## Cómo funciona

### Flujo de un mensaje

```
WhatsApp → Baileys → Parser → API TRAID-ERP
                        ↓
                  Detecta (VID-042)?
                        ↓
                  Upsert lead + log message
```

### Códigos de atribución

Cuando un video de TikTok o Reel tiene un link de WhatsApp con un mensaje pre-cargado, el cliente llega con un código de fuente que permite rastrear de qué contenido vino.

**Formato:** `(PLATAFORMA-NÚMERO)`

| Prefijo | Plataforma |
|---------|------------|
| `VID` | Video (YouTube, Reels) |
| `IG` | Instagram |
| `TT` | TikTok |

### Ejemplo de link wa.me

```
https://wa.me/5492612345678?text=Hola%2C%20vi%20tu%20video%20y%20me%20interesa%20(VID-042)
```

Al hacer click, el cliente abre WhatsApp con el mensaje:

> Hola, vi tu video y me interesa (VID-042)

El servicio detecta `VID-042`, registra el lead con esa fuente, y logea el mensaje en el CRM.

### Tipos de mensaje soportados

| Tipo | Procesamiento |
|------|--------------|
| Texto | Se registra directamente |
| Audio | Se transcribe con Gemini y se guarda la transcripción |
| Imagen | Se describe con Gemini y se guarda caption + descripción |
| Video | Se guarda el caption |
| Documento | Se guarda el nombre del archivo |

## Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Desarrollo con hot-reload |
| `npm start` | Producción |
| `npm run build` | Compilar TypeScript |

## Estructura

```
src/
├── index.ts        -- Entry point, inicia ambas sesiones
├── session.ts      -- Conexión WhatsApp con Baileys
├── parser.ts       -- Extracción de códigos y datos del contacto
├── api-client.ts   -- Cliente HTTP para TRAID-ERP API
├── media.ts        -- Transcripción de audio y descripción de imagen
└── config.ts       -- Variables de entorno
```
