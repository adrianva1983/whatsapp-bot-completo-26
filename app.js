// app.js
import 'dotenv/config'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import pino from 'pino'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import { replyWithAI } from './ai/index.js'
import { jidToNumber, numberToJid, isMentionedMe } from './utils/wa.js'
import { Memory } from './utils/memory.js'
import { ChatDatabase } from './utils/database.js';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT || 3000)
const AUTH_DIR = path.resolve(__dirname, process.env.AUTH_DIR || 'auth')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
let sock = null
let connected = false
let starting = false

// Variables para el QR
let currentQR = null;
let qrRetries = 0;
const MAX_QR_RETRIES = 5;
let lastQRPNG = null; // Buffer para la imagen PNG del QR

// Variables para estadísticas del dashboard
let botStats = {
  startTime: Date.now(),
  totalMessages: 0,
  totalChats: new Set(),
  aiResponses: 0,
  messagesByHour: new Array(24).fill(0),
  messageTypes: {
    text: 0,
    image: 0,
    document: 0,
    audio: 0,
    other: 0
  },
  recentActivity: []
};

// Función para agregar actividad reciente
function addRecentActivity(type, description) {
  const activity = {
    type,
    description,
    timestamp: new Date().toISOString()
  };
  
  botStats.recentActivity.unshift(activity);
  if (botStats.recentActivity.length > 50) {
    botStats.recentActivity = botStats.recentActivity.slice(0, 50);
  }
}

// Función para manejar la generación del QR
const handleQR = async (qr) => {
    try {
        if (!qr) return;

        currentQR = qr;
        qrRetries++;

        logger.info('🔄 Nuevo código QR generado');
        
        // Generar y cachear QR para la API directamente aquí
        try {
            lastQRPNG = await QRCode.toBuffer(qr, { margin: 1, scale: 6 });
            logger.info('✅ Buffer QR generado correctamente');
        } catch (bufferError) {
            logger.error('❌ Error generando QR buffer:', bufferError.message);
            logger.error('Stack trace buffer:', bufferError.stack);
        }
        
        // Generar imagen QR para archivo HTML
        try {
            const qrImage = await QRCode.toDataURL(qr);
            
            // Guardar QR en archivo para acceso vía API
            fs.writeFileSync('./public/qr.html', `
                <html>
                    <body style="display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                        <img src="${qrImage}" alt="WhatsApp QR Code">
                    </body>
                </html>
            `);

            logger.info(`📱 QR disponible en: http://localhost:3000/qr.html`);
        } catch (htmlError) {
            logger.error('❌ Error generando QR HTML:', htmlError.message);
            logger.error('Stack trace HTML:', htmlError.stack);
        }

    } catch (error) {
        logger.error('❌ Error general en handleQR:', error.message || error);
        logger.error('Stack trace general:', error.stack);
    }
};

/* ------------------- utilidades ------------------- */
function exists(p) { try { fs.accessSync(p); return true } catch { return false } }

async function rimraf(dir) {
  try {
    if (exists(dir)) await fs.promises.rm(dir, { recursive: true, force: true })
  } catch (e) {
    logger.warn({ err: e }, 'No se pudo borrar dir de auth (continuamos)')
  }
}

async function resetAuthDir() {
  logger.warn({ AUTH_DIR }, 'Reseteando credenciales...')
  await rimraf(AUTH_DIR)
  // recrea carpeta vacía para evitar errores de permisos
  await fs.promises.mkdir(AUTH_DIR, { recursive: true })
}

async function cacheQR(qrString) {
  try {
    currentQR = qrString
    lastQRPNG = await QRCode.toBuffer(qrString, { margin: 1, scale: 6 })
  } catch (e) {
    logger.error({ err: e }, 'Error generando QR PNG')
  }
}

function clearQRCache() {
  currentQR = null
  lastQRPNG = null
}

/** Reinicio suave: cierra socket y vuelve a startWA */
async function softRestart(reason = 'soft-restart') {
  try {
    logger.warn({ reason }, 'Solicitud de reinicio')
    await closeSocket()
  } catch (e) {
    logger.warn({ err: e }, 'Error cerrando socket en reinicio')
  }
  return startWA()
}

/** Cierra el socket de forma segura */
async function closeSocket() {
  try {
    if (!sock) return
    // logout revoca la sesión remota. Úsalo solo si quieres cerrar la sesión en el dispositivo.
    if (sock.logout) {
      // no siempre queremos revocar; si solo reiniciamos, mejor solo cerrar:
      try { await sock.ws?.close() } catch {}
    } else {
      try { await sock.ws?.close() } catch {}
    }
  } catch (e) {
    logger.warn({ err: e }, 'Error al cerrar socket')
  } finally {
    sock = null
    connected = false
  }
}

/* ---------- Watchdog QR: si desconectado y sin QR por X segundos, reinicia ---------- */
let qrWatchdogTimer = null
function scheduleQRWatchdog() {
  if (qrWatchdogTimer) clearTimeout(qrWatchdogTimer)
  // Si en 40s seguimos sin QR y sin conexión -> reinicio suave
  qrWatchdogTimer = setTimeout(() => {
    if (!connected && !currentQR && !starting) {
      logger.warn('Watchdog: sin conexión y sin QR, forzando reinicio…')
      softRestart('qr-watchdog')
    }
  }, 40_000)
}

/* ------------------ ciclo principal WA ------------------ */
async function startWA() {
  if (starting) {
    logger.warn('startWA: ya en progreso, ignorando')
    return
  }
  starting = true
  clearQRCache()

  try {
    await fs.promises.mkdir(AUTH_DIR, { recursive: true })
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
      version,
      logger: pino({ level: 'warn' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['HipoteaBot', 'Chrome', '1.0.1'],
      syncFullHistory: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        await handleQR(qr);
      }

      if (connection === 'open') {
        connected = true
        clearQRCache()
        logger.info({ user: sock?.user }, '✅ Conectado a WhatsApp')
      } else if (connection === 'close') {
        connected = false
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const asText = String(lastDisconnect?.error || '')
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        logger.warn({ statusCode, asText }, 'Conexión cerrada')

        if (statusCode === DisconnectReason.loggedOut) {
          // Caso clave: borrar credenciales y reiniciar => genera QR nuevo
          await resetAuthDir()
          await softRestart('loggedOut')
          return
        }

        // Otros cierres temporales -> reintentar
        if (shouldReconnect) {
          setTimeout(() => startWA().catch(err => logger.error({ err }, 'Reintento falló')), 1500)
        } else {
          logger.error('Conexión cerrada sin reintentos.')
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
          const msg = messages[0];
          if (!msg.message || !msg.key.remoteJid) {
              logger.info('Mensaje ignorado: no contiene mensaje o remoteJid');
              return;
          }
          
          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          if (!text) {
              logger.info('Mensaje ignorado: texto vacío');
              return;
          }
          
          const fromNumber = msg.key.remoteJid;
          
          // Actualizar estadísticas
          botStats.totalMessages++;
          botStats.totalChats.add(fromNumber);
          
          // Rastrear tipo de mensaje
          if (msg.message?.conversation || msg.message?.extendedTextMessage) {
            botStats.messageTypes.text++;
          } else if (msg.message?.imageMessage) {
            botStats.messageTypes.image++;
          } else if (msg.message?.documentMessage) {
            botStats.messageTypes.document++;
          } else if (msg.message?.audioMessage) {
            botStats.messageTypes.audio++;
          } else {
            botStats.messageTypes.other++;
          }
          
          // Rastrear mensajes por hora
          const hour = new Date().getHours();
          botStats.messagesByHour[hour]++;
          
          // Agregar actividad reciente
          addRecentActivity('message', `Mensaje recibido de ${fromNumber.split('@')[0]}`);
          
          logger.info({
              event: 'mensaje_recibido',
              fromNumber,
              text,
              totalMessages: botStats.totalMessages
          }, '📩 Nuevo mensaje recibido');

          // Intentar guardar en BD
          try {
              await db.testConnection();
              logger.info('✅ Conexión a BD verificada');
              
              await db.addMessage(fromNumber, 'user', text);
              logger.info('💾 Mensaje usuario guardado en BD');
              
              const history = await db.getHistory(fromNumber);
              logger.info({
                  historyLength: history.length,
                  fromNumber
              }, '📚 Historial recuperado');
              
              const aiReply = await replyWithAI({
                  text,
                  fromNumber,
                  history: history.map(h => ({
                      role: h.role,
                      text: h.text
                  }))
              });
              
              // Actualizar estadísticas de IA
              botStats.aiResponses++;
              addRecentActivity('ai', `Respuesta IA generada para ${fromNumber.split('@')[0]}`);
              
              await db.addMessage(fromNumber, 'assistant', aiReply);
              logger.info('💾 Respuesta bot guardada en BD');
              
              await sock.sendMessage(fromNumber, { text: aiReply });
              
          } catch (dbError) {
              logger.error({
                  error: dbError.message,
                  stack: dbError.stack
              }, '❌ Error de base de datos');
          }
          
      } catch (error) {
          logger.error({
              error: error.message,
              stack: error.stack
          }, '❌ Error general procesando mensaje');
      }
    })
  } catch (e) {
    logger.error({ err: e }, 'Error al iniciar WA')
  } finally {
    starting = false
    scheduleQRWatchdog()
  }
}

/* ---------- Web (dashboard + API) ---------- */
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

app.get('/api/status', (req, res) => {
  const uptime = Date.now() - botStats.startTime;
  res.json({
    connected,
    qr: !!currentQR,
    device: sock?.user?.id || null,
    aiProvider: (process.env.AI_PROVIDER || 'gemini'),
    stats: {
      totalMessages: botStats.totalMessages,
      totalChats: botStats.totalChats.size,
      aiResponses: botStats.aiResponses,
      uptime: uptime,
      messagesByHour: botStats.messagesByHour,
      messageTypes: botStats.messageTypes,
      recentActivity: botStats.recentActivity.slice(0, 10)
    }
  })
})

app.get('/api/qr', (req, res) => {
  if (!lastQRPNG) return res.status(404).json({ ok: false, error: 'No hay QR activo' })
  res.setHeader('Content-Type', 'image/png')
  res.send(lastQRPNG)
})

app.get('/api/qr-status', (req, res) => {
    res.json({
        hasQR: !!currentQR,
        connected,
        retries: qrRetries
    });
})

/** Forzar "re-vinculación": limpia AUTH_DIR y reinicia => genera QR nuevo */
app.post('/api/relink', async (req, res) => {
  try {
    await closeSocket()
    await resetAuthDir()
    await startWA()
    res.json({ ok: true, message: 'Relink solicitado. Carga /api/qr para ver el nuevo QR.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

/** Logout “duro”: revoca sesión en WhatsApp (si procede), limpia AUTH_DIR y reinicia */
app.post('/api/logout', async (req, res) => {
  try {
    try { if (sock?.logout) await sock.logout() } catch (e) {
      logger.warn({ err: e }, 'logout() falló; continuamos con limpieza local')
    }
    await closeSocket()
    await resetAuthDir()
    await startWA()
    res.json({ ok: true, message: 'Logout completo. Nuevo QR listo en /api/qr.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

/** Envío manual */
app.post('/api/send', async (req, res) => {
  try {
    if (!sock) return res.status(503).json({ ok: false, error: 'Socket no iniciado' })
    const { to, text } = req.body || {}
    if (!to || !text) return res.status(400).json({ ok: false, error: 'Parámetros requeridos: to, text' })
    const jid = numberToJid(to)
    await sock.sendMessage(jid, { text })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) })
  }
})

app.post('/api/clear-history', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Se requiere phoneNumber' });
    }
    await db.clearHistory(phoneNumber);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

// SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  logger.info(`🌐 Dashboard en http://localhost:${PORT}`)
  startWA().catch(e => {
    console.error('Fatal:', e)
    process.exit(1)
  })
})

/* ---------- Señales del proceso ---------- */
process.on('SIGINT', async () => {
  logger.info('Saliendo (SIGINT)…')
  await closeSocket()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  logger.info('Saliendo (SIGTERM)…')
  await closeSocket()
  process.exit(0)
})
