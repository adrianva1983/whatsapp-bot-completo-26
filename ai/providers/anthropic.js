// ai/providers/anthropic.js
import Anthropic from '@anthropic-ai/sdk'

export function createAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) console.warn('[Anthropic] Falta ANTHROPIC_API_KEY')
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'
  const client = new Anthropic({ apiKey: apiKey || 'MISSING' })

  return {
    name: 'anthropic',
    async generate(p) {
      const msgs = (p.history || []).map(t => ({
        role: t.role === 'assistant' ? 'assistant' : 'user',
        content: [{ type: 'text', text: t.text }]
      }))
      msgs.push({ role: 'user', content: [{ type: 'text', text: p.text }] })

      const res = await client.messages.create({
        model,
        system: p.system || '',
        messages: msgs,
        max_tokens: 500,
        temperature: 0.7
      })
      const parts = res?.content?.map(c => ('text' in c ? c.text : '')).join('') || ''
      return parts
    }
  }
}
