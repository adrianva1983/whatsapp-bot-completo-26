// utils/wa.js
export function numberToJid(number) {
  const n = String(number).replace(/\D/g, '')
  return n.endsWith('@s.whatsapp.net') ? n : n + '@s.whatsapp.net'
}

export function jidToNumber(jid) {
  return String(jid || '').replace(/@.*$/, '')
}

export async function isMentionedMe(sock, msg) {
  try {
    const myJid = sock?.user?.id
    const ctx = msg?.message?.extendedTextMessage?.contextInfo
    const list = ctx?.mentionedJid || []
    return !!list.find(j => j === myJid)
  } catch {
    return false
  }
}
