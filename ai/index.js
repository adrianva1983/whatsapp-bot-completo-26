// ai/index.js
import { createGeminiProvider } from './providers/gemini.js'
import { createOpenAIProvider } from './providers/openai.js'
import { createAnthropicProvider } from './providers/anthropic.js'
import { createLocalProvider } from './providers/local.js'

const providerName = (process.env.AI_PROVIDER || 'gemini').toLowerCase()

function systemDefault() {
  return [
    'Eres un asistente de WhatsApp en español.',
    'Responde claro y útil en 3-5 frases como máximo.',
    'Si piden algo técnico, da pasos concisos y ejemplos.',
    'Evita mensajes muy largos; usa listas cortas si ayudan.'
  ].join(' ')
}

function pickProvider() {
  switch (providerName) {
    case 'openai': return createOpenAIProvider()
    case 'anthropic': return createAnthropicProvider()
    case 'local': return createLocalProvider()
    default: return createGeminiProvider()
  }
}

const provider = pickProvider()

export async function replyWithAI({ text, fromNumber, history }) {
  const sys = systemDefault()
  try {
    const out = await provider.generate({
      system: sys,
      text: text || '',
      fromNumber,
      history
    })
    const reply = (out || '').toString().trim()
    return reply || '¿Podrías repetirlo, por favor?'
  } catch (err) {
    console.error('[AI] Error:', err?.message || err)
    return 'Ahora mismo no puedo pensar 😅. Inténtalo de nuevo en un momento.'
  }
}
