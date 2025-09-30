// ai/providers/openai.js
import OpenAI from 'openai'

export function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) console.warn('[OpenAI] Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const client = new OpenAI({ apiKey: apiKey || 'MISSING' })

  return {
    name: 'openai',
    async generate(p) {
      const messages = []
      if (p.system) messages.push({ role: 'system', content: p.system })
      ;(p.history || []).forEach(t => {
        messages.push({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          content: t.text
        })
      })
      messages.push({ role: 'user', content: p.text })
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.7
      })
      return res?.choices?.[0]?.message?.content || ''
    }
  }
}
