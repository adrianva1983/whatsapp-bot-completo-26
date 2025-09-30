// ai/providers/local.js
export function createLocalProvider() {
  const url = process.env.LOCAL_AI_URL
  const model = process.env.LOCAL_AI_MODEL || 'llama3.1'

  return {
    name: 'local',
    async generate(p) {
      if (!url) {
        console.warn('[LocalAI] Falta LOCAL_AI_URL')
        return 'El proveedor local no está configurado.'
      }
      const messages = []
      if (p.system) messages.push({ role: 'system', content: p.system })
      ;(p.history || []).forEach(t => {
        messages.push({
          role: t.role === 'assistant' ? 'assistant' : 'user',
          content: t.text
        })
      })
      messages.push({ role: 'user', content: p.text })

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages })
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`[LocalAI] HTTP ${res.status} ${txt}`)
      }
      const data = await res.json()
      return data.reply || data.output || JSON.stringify(data)
    }
  }
}
