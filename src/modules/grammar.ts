import { $, getPinyin } from '../utils'
import { DEP_ROLES } from '../constants'

export async function analyzeGrammar(text: string): Promise<void> {
  showGrammarModal(text, null, true)
  try {
    const r   = await fetch('/api/parse-zh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const raw = await r.text()
    let data: any
    try { data = JSON.parse(raw) } catch { throw new Error(`Server error ${r.status}`) }
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
    const bodyEl = $('grammar-modal-body')
    if (bodyEl) bodyEl.innerHTML = renderGrammarResult(data)
  } catch (e: any) {
    const bodyEl = $('grammar-modal-body')
    if (bodyEl) bodyEl.innerHTML = `<p style="color:var(--red);font-size:13px;text-align:center;padding:12px">⚠️ ${e.message}</p>`
  }
}

function showGrammarModal(text: string, _data: any, loading: boolean): void {
  document.querySelector('#grammar-modal')?.remove()
  const modal = document.createElement('div')
  modal.id = 'grammar-modal'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px'
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:24px 22px;width:min(680px,100%);max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <h3 style="font-size:16px;font-weight:700;margin:0">🔍 Phân tích ngữ pháp</h3>
        <button id="grammar-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);line-height:1">✕</button>
      </div>
      <p style="font-size:12px;color:var(--text3);margin:0 0 16px;font-family:'Noto Sans SC',sans-serif">${text.slice(0, 80)}${text.length > 80 ? '…' : ''}</p>
      <div id="grammar-modal-body">
        ${loading ? `<div style="text-align:center;padding:28px 0"><div class="spinner" style="margin:0 auto 12px"></div><p style="color:var(--text3);font-size:13px">Đang phân tích...</p></div>` : ''}
      </div>
    </div>`
  document.body.appendChild(modal)
  modal.querySelector('#grammar-modal-close')!.addEventListener('click', () => modal.remove())
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove() })
}

function renderGrammarResult(data: any): string {
  const sentences = data.sentences || []
  if (!sentences.length) return `<p style="color:var(--text3);font-size:13px;text-align:center">Không có dữ liệu.</p>`

  const legend = `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;padding:10px 14px;background:var(--surface2);border-radius:8px">
    ${Object.values(DEP_ROLES).map(r => `<span style="font-size:11px;font-weight:700;color:${r.color};display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:${r.color};flex-shrink:0;display:inline-block"></span>${r.vi}</span>`).join('')}
    <span style="font-size:11px;font-weight:600;color:var(--text3);display:flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:var(--border2);flex-shrink:0;display:inline-block"></span>Hư từ / Khác</span>
  </div>`

  const sentencesHtml = sentences.map((sent: any) => {
    const tokHtml = (sent.tokens || []).map((tok: any) => {
      const role  = DEP_ROLES[tok.role]
      const color = role?.color || null
      const label = role?.vi    || ''
      const py    = getPinyin(tok.text)
      const boxBg = color ? color + '18' : 'var(--surface2)'
      return `<div style="display:inline-flex;flex-direction:column;align-items:center;margin:3px 4px 3px 0;vertical-align:top">
        <span style="font-size:10px;font-weight:700;color:${color || 'var(--text3)'};min-height:14px;line-height:14px;text-align:center">${label}</span>
        <span style="font-family:'Noto Serif SC',serif;font-size:20px;font-weight:600;color:${color || 'var(--text)'};background:${boxBg};border-radius:6px;padding:4px 8px;line-height:1.3;border:1.5px solid ${color ? color + '30' : 'var(--border)'}">${tok.text}</span>
        <span style="font-size:10px;color:var(--text3);margin-top:2px;min-height:14px;line-height:14px">${py}</span>
      </div>`
    }).join('')
    return `<div style="margin-bottom:18px;padding:14px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">${tokHtml}</div>`
  }).join('')

  return legend + sentencesHtml
}
