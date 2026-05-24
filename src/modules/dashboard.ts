import { db } from '../state'
import { $, tr, getWtInfo } from '../utils'
import { nav } from '../router'

export function renderDashboard(): void {
  const words = db.words
  const now   = Date.now()
  const today = new Date().toISOString().split('T')[0]
  const due   = words.filter(w => !w.nextReview || w.nextReview <= now)

  ;($('stat-total') as HTMLElement).textContent  = String(words.length)
  ;($('stat-due') as HTMLElement).textContent    = String(due.length)
  ;($('stat-learned') as HTMLElement).textContent   = String(words.filter(w => w.repetitions > 0).length)
  ;($('stat-mastered') as HTMLElement).textContent  = String(words.filter(w => w.status === 'mastered').length)
  ;($('stat-today') as HTMLElement).textContent  = String(db.sessions[today] || 0)
  ;($('stat-accuracy') as HTMLElement).textContent  = db.total > 0 ? String(Math.round(db.correct / db.total * 100)) : '—'

  let streak = 0
  const d = new Date()
  while (true) {
    const k = d.toISOString().split('T')[0]
    if ((db.sessions[k] || 0) > 0) { streak++; d.setDate(d.getDate() - 1) } else break
  }
  ;($('stat-streak') as HTMLElement).textContent = String(streak)

  const banner = $('due-banner') as HTMLElement
  if (due.length) {
    banner.style.display = 'block'
    ;($('due-banner-text') as HTMLElement).textContent = `${due.length} từ cần ôn tập ngay!`
  } else {
    banner.style.display = 'none'
  }

  // Heatmap
  const hm = $('heatmap')!
  hm.innerHTML = ''
  const td = new Date()
  for (let w = 11; w >= 0; w--) {
    const col = document.createElement('div')
    col.className = 'heatmap-week'
    for (let dy = 0; dy < 7; dy++) {
      const dt = new Date(td)
      dt.setDate(dt.getDate() - w * 7 - dy)
      const k = dt.toISOString().split('T')[0]
      const c = db.sessions[k] || 0
      const cell = document.createElement('div')
      cell.className = 'heatmap-cell' + (c === 0 ? '' : c < 3 ? ' l1' : c < 7 ? ' l2' : c < 15 ? ' l3' : ' l4')
      cell.title = `${k}: ${c} từ`
      col.appendChild(cell)
    }
    hm.appendChild(col)
  }

  // Recent words
  const rw = $('recent-words')!
  const recent = [...words].reverse().slice(0, 6)
  rw.innerHTML = recent.length
    ? recent.map(w => {
        const wts = w.wordTypes?.length ? w.wordTypes : (w.wordType ? [w.wordType] : [])
        const badges = wts.map(k => {
          const i = getWtInfo(k)
          return i ? `<span style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;background:${i.bg};color:${i.color};display:inline-block">${i.key} ${i.vi}</span>` : ''
        }).join('')
        return `<div class="word-tile"><div class="zh">${tr(w.zh)}</div><div class="py">${w.pinyin}</div><div class="vi">${w.vi}</div>${badges ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${badges}</div>` : ''}</div>`
      }).join('')
    : `<div style="color:var(--text3);font-size:14px;grid-column:1/-1">Chưa có từ. <span style="color:var(--red);cursor:pointer" id="add-first-link">Thêm từ đầu tiên!</span></div>`
  document.getElementById('add-first-link')?.addEventListener('click', () => nav('add'))
}
