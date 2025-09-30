// ai/providers/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai'

export function createGeminiProvider() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) console.warn('[Gemini] Falta GOOGLE_API_KEY')
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  const genAI = new GoogleGenerativeAI(apiKey || 'MISSING')
  const model = genAI.getGenerativeModel({ model: modelName })

  return {
    name: 'gemini',
    async generate(p) {
      // Construimos un prompt simple a partir del system + history
      const parts = []
      if (p.system) parts.push(`SYSTEM: ${p.system}`)
      for (const turn of p.history || []) {
        const role = turn.role === 'assistant' ? 'ASSISTANT' : 'USER'
        parts.push(`${role}: ${turn.text}`)
      }
      parts.push(`USER: ${p.text}`)
      parts.push('ASSISTANT:')

      const content = parts.join('\n')

      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: content }]}]
      })
      const out = res?.response?.text?.() || ''
      return out
    }
  }
}
