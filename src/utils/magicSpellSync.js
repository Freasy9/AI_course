/**
 * COSTAR 实验室 → 魔法咒语工坊：一次性同步普通提示词与 COSTAR（sessionStorage，读取后即清除）
 */
export const MAGIC_SPELL_SYNC_STORAGE_KEY = 'ai-lab-magic-spell-sync-v1'

export function writeMagicSpellSync({ commonPrompt, costar }) {
  try {
    const payload = {
      commonPrompt: String(commonPrompt ?? ''),
      costar: {
        context: String(costar?.context ?? ''),
        objective: String(costar?.objective ?? ''),
        style: String(costar?.style ?? ''),
        tone: String(costar?.tone ?? ''),
        audience: String(costar?.audience ?? ''),
        response: String(costar?.response ?? ''),
      },
      ts: Date.now(),
    }
    sessionStorage.setItem(MAGIC_SPELL_SYNC_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/** 读取并删除，避免重复应用 */
export function consumeMagicSpellSync() {
  try {
    const raw = sessionStorage.getItem(MAGIC_SPELL_SYNC_STORAGE_KEY)
    if (!raw) return null
    sessionStorage.removeItem(MAGIC_SPELL_SYNC_STORAGE_KEY)
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}
