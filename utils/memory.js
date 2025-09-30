// utils/memory.js
export class Memory {
  constructor({ maxTurns = 8 } = {}) {
    this.maxTurns = maxTurns
    this.map = new Map()
  }
  get(key) {
    return this.map.get(key) || []
  }
  push(key, turn) {
    const arr = this.map.get(key) || []
    arr.push({ role: turn.role, text: String(turn.text || '').slice(0, 2000) })
    while (arr.length > this.maxTurns) arr.shift()
    this.map.set(key, arr)
  }
}
