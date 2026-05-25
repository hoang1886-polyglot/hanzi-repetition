import {
  db, reviewQueue, currentCard, answered, reviewCorrect, reviewTotal, reviewInitial, reviewWrong,
  artReviewQueue, artReviewCard, artReviewAnswered, artReviewCorrect, artReviewTotal, artReviewInitial,
  currentArticleId,
  setReviewQueue, setCurrentCard, setAnswered, setReviewStats,
  setArtReviewQueue, setArtReviewCard, setArtReviewAnswered, setArtReviewStats,
} from '../state'
import { $, tr, getPinyin, toast, wordTypeBadgeHtml } from '../utils'
import { sm2, sm2Local, intLabel } from '../sm2'
import { save } from '../sync'
import { nav } from '../router'
import { getDictFull, loadDict } from '../dict'

function getCharHint(zh: string): string | null {
  const chars = [...zh]
  if (chars.length < 2) return null
  const idx = Math.floor(Math.random() * chars.length)
  return chars.map((c, i) =>
    i === idx
      ? `<span style="color:var(--red);font-weight:700">${c}</span>`
      : '<span style="color:var(--text3)">＿</span>'
  ).join(' ')
}

export function startReview(): void {
  setReviewQueue(db.words.filter(w => !w.nextReview || w.nextReview <= Date.now()).map(w => ({ ...w })).sort(() => Math.random() - 0.5))
  setReviewStats(0, 0, reviewQueue.length, [])
  setAnswered(false)
  renderReviewCard()
}

function setupReviewDictLookup(container: HTMLElement): void {
  if (!container) return
  document.getElementById('review-dict-tip')?.remove()
  const tip = document.createElement('div')
  tip.id = 'review-dict-tip'
  tip.style.cssText = `position:fixed;z-index:9999;background:var(--surface);border:1.5px solid var(--border2);border-radius:10px;padding:10px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.22);min-width:160px;max-width:280px;display:none;pointer-events:none;font-family:'DM Sans',sans-serif;`
  document.body.appendChild(tip)
  const hide = () => { tip.style.display = 'none' }
  document.addEventListener('click', hide)

  container.addEventListener('dblclick', e => {
    const sel = window.getSelection()
    let text = sel?.toString().trim() || ''
    if (!text || !/[一-鿿]/.test(text)) {
      let el = e.target as HTMLElement
      while (el && el !== container) {
        const t = el.textContent || ''
        if (/[一-鿿]/.test(t)) { text = t.trim(); break }
        el = el.parentElement!
      }
    }
    text = text.replace(/[^一-鿿㐀-䶿]/g, '')
    if (!text) return
    sel?.removeAllRanges()
    e.preventDefault(); e.stopPropagation()

    const showLookup = (dict: Record<string, string>) => {
      const found = dict[text]
      let html = `<div style="font-family:'Noto Sans SC',sans-serif;font-size:18px;font-weight:700;color:var(--text);margin-bottom:2px">${text}</div>`
      html += `<div style="font-size:12px;color:var(--text3);margin-bottom:6px;letter-spacing:0.03em">${getPinyin(text)}</div>`
      if (found) {
        html += found.split(';').map(d => d.trim()).filter(Boolean).slice(0, 4)
          .map(d => `<div style="font-size:13px;color:var(--text2);line-height:1.5;padding:1px 0">· ${d}</div>`).join('')
      } else if (text.length > 1) {
        const rows = [...text].map(c => dict[c] ? `<div style="font-size:13px;color:var(--text2);padding:1px 0"><span style="font-family:'Noto Sans SC',sans-serif;font-weight:600">${c}</span> · ${dict[c].split(';')[0].trim()}</div>` : null).filter(Boolean)
        html += rows.length ? rows.join('') : `<div style="font-size:12px;color:var(--text3)">Không tìm thấy</div>`
      } else {
        html += `<div style="font-size:12px;color:var(--text3)">Không tìm thấy</div>`
      }
      tip.innerHTML = html
      const vw = window.innerWidth, vh = window.innerHeight
      let tx = (e as MouseEvent).clientX + 12, ty = (e as MouseEvent).clientY + 12
      tip.style.display = 'block'
      const tw = tip.offsetWidth, th = tip.offsetHeight
      if (tx + tw > vw - 8) tx = (e as MouseEvent).clientX - tw - 12
      if (ty + th > vh - 8) ty = (e as MouseEvent).clientY - th - 12
      tip.style.left = tx + 'px'; tip.style.top = ty + 'px'; tip.style.pointerEvents = 'none'
    }

    const dict = getDictFull()
    if (Object.keys(dict).length) {
      showLookup(dict)
    } else {
      tip.innerHTML = `<div style="font-size:12px;color:var(--text3)">Đang tải từ điển...</div>`
      tip.style.display = 'block'; tip.style.left = ((e as MouseEvent).clientX + 12) + 'px'; tip.style.top = ((e as MouseEvent).clientY + 12) + 'px'
      loadDict().then(() => showLookup(getDictFull()))
    }
  })
}

export function renderReviewCard(): void {
  const rc = $('review-content')!, rs = $('review-subtitle')!
  if (!reviewQueue.length) {
    rs.textContent = ''
    const pct = reviewTotal > 0 ? Math.round(reviewCorrect / reviewTotal * 100) : 0
    const grade = pct >= 90 ? '🏆 Xuất sắc!' : pct >= 70 ? '🎉 Tốt lắm!' : pct >= 50 ? '💪 Cần cố thêm!' : '📚 Hãy ôn thêm nhé!'
    rc.innerHTML = `<div class="review-card" style="text-align:center">
      <div style="font-size:52px;margin-bottom:16px">${pct >= 70 ? '🎉' : '📖'}</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:6px">${grade}</div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px">Bạn đã hoàn thành luyện tập</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--border)"><div style="font-size:28px;font-weight:700">${reviewInitial}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Từ đã ôn</div></div>
        <div style="background:var(--green-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--green-border)"><div style="font-size:28px;font-weight:700;color:var(--green)">${reviewCorrect}</div><div style="font-size:11px;color:var(--green);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Trả lời đúng</div></div>
        <div style="background:var(--red-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--red-mid)"><div style="font-size:28px;font-weight:700;color:var(--red)">${pct}%</div><div style="font-size:11px;color:var(--red);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Độ chính xác</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="submit-btn" id="review-again-btn" style="padding:11px 24px">🔄 Luyện lại</button>
        <button id="review-home-btn" style="padding:11px 24px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">← Trang chủ</button>
      </div>
      ${reviewWrong.length > 0 ? `
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.07em;margin-bottom:10px;text-transform:uppercase">${reviewWrong.length} từ chưa thuộc</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="review-copy-wrong" style="padding:9px 18px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:13px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">📋 Sao chép danh sách</button>
          <button id="review-export-csv" style="padding:9px 18px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:13px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">📊 Xuất Excel (.csv)</button>
        </div>
      </div>` : ''}
      </div>`
    $('review-again-btn')?.addEventListener('click', startReview)
    $('review-home-btn')?.addEventListener('click', () => nav('dashboard'))
    if (reviewWrong.length > 0) {
      $('review-copy-wrong')?.addEventListener('click', () => {
        const text = reviewWrong.map((w: any) => `${w.zh}\t${w.pinyin}\t${w.vi}`).join('\n')
        navigator.clipboard.writeText(text)
          .then(() => toast('✓ Đã sao chép danh sách từ sai!'))
          .catch(() => toast('Không thể sao chép, vui lòng thử lại.'))
      })
      $('review-export-csv')?.addEventListener('click', () => {
        const rows = [['Chữ Hán', 'Pinyin', 'Nghĩa tiếng Việt', 'Trạng thái']]
        reviewWrong.forEach((w: any) => {
          rows.push([w.zh, w.pinyin || getPinyin(w.zh), w.vi || '', w.status || ''])
        })
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'tu-chua-thuoc.csv'
        document.body.appendChild(a); a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      })
    }
    return
  }
  setCurrentCard(reviewQueue[0])
  const done = reviewInitial - reviewQueue.length
  rs.textContent = `${done}/${reviewInitial} từ · ${reviewCorrect} đúng`
  rc.innerHTML = buildReviewCardHtml(currentCard!, done, reviewInitial, false)
  const inp = $('answer-input') as HTMLInputElement
  inp?.focus()
  inp?.addEventListener('input', () => { const el = $('live-pinyin'); if (el) el.textContent = getPinyin(inp.value) })
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer() })
  $('check-btn')?.addEventListener('click', checkAnswer)
  rc.querySelectorAll('.diff-btn').forEach(btn =>
    btn.addEventListener('click', () => gradeCard(parseInt((btn as HTMLElement).dataset.grade!)))
  )
  const hintBtn = $('hint-toggle-btn')
  if (hintBtn) hintBtn.addEventListener('click', () => toggleHint('hint-content', hintBtn as HTMLElement, '💡 Xem gợi ý', '💡 Ẩn gợi ý'))
  const charHintBtn = $('char-hint-btn')
  if (charHintBtn) charHintBtn.addEventListener('click', () => showCharHint('char-hint-display', charHintBtn as HTMLElement, currentCard!.zh))
  setupReviewDictLookup($('review-content')!)
  setAnswered(false)
}

function buildReviewCardHtml(card: any, done: number, total: number, isArticle: boolean): string {
  const pfx = isArticle ? 'art-' : ''
  return `
    <div class="review-progress"><div class="review-progress-fill" style="width:${total > 0 ? done / total * 100 : 0}%"></div></div>
    <div class="review-card">
      <div class="review-vi">NGHĨA TIẾNG VIỆT</div>
      <div class="review-word">${card.vi}</div>
      ${wordTypeBadgeHtml(card.wordType, card.wordTypes)}
      ${card.zhDef ? `<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:8px 14px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);text-align:left">🀄 <span style="font-family:'Noto Sans SC',sans-serif">${tr(card.zhDef)}</span></div>` : ''}
      ${card.exVi ? `<div style="font-size:13px;color:var(--text2);margin-top:10px;padding:11px 16px;background:var(--surface2);border-radius:8px;text-align:left;border:1px solid var(--border)"><div style="font-family:'Noto Sans SC',sans-serif;font-size:14px;margin-bottom:4px">${tr(card.exZh || '')}</div><div>${card.exVi}</div></div>` : ''}
      ${card.note ? `<div style="margin-top:10px"><button id="${pfx}hint-toggle-btn" style="padding:5px 14px;background:var(--surface2);border:1.5px dashed var(--border2);border-radius:6px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'DM Sans',sans-serif">💡 Xem gợi ý</button><div id="${pfx}hint-content" style="display:none;margin-top:8px;padding:12px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:13px;color:var(--text);line-height:1.6;white-space:pre-wrap;text-align:left">${card.note}</div></div>` : ''}
      ${[...card.zh].length >= 2 ? `<div style="margin-top:10px"><button id="${pfx}char-hint-btn" style="padding:6px 16px;background:linear-gradient(135deg,#3b9cf5,#1e6be5);border:none;border-radius:16px;font-size:12px;font-weight:700;color:#fff;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 2px 8px rgba(30,107,229,0.25)">🔍 Gợi ý 1 chữ</button><div id="${pfx}char-hint-display" style="display:none;margin-top:8px;padding:10px 16px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);font-size:22px;font-family:'Noto Serif SC',serif;letter-spacing:0.15em;text-align:center"></div></div>` : ''}
      <div class="review-pinyin" id="${pfx}live-pinyin"></div>
      <input type="text" class="answer-input" id="${pfx}answer-input" placeholder="Nhập chữ Hán...">
      <div class="feedback-bar" id="${pfx}feedback-bar"></div>
      <div class="correct-answer" id="${pfx}correct-ans" style="display:none"></div>
      <button class="check-btn" id="${pfx}check-btn">Kiểm tra</button>
    </div>
    <div class="diff-btns" id="${pfx}diff-btns" style="display:none">
      <button class="diff-btn again" data-grade="0"><span class="emoji">❌</span><span class="label">Lại</span><span class="interval" id="${pfx}i0"></span></button>
      <button class="diff-btn hard"  data-grade="1"><span class="emoji">😐</span><span class="label">Khó</span><span class="interval" id="${pfx}i1"></span></button>
      <button class="diff-btn good"  data-grade="2"><span class="emoji">🙂</span><span class="label">Được</span><span class="interval" id="${pfx}i2"></span></button>
      <button class="diff-btn easy"  data-grade="3"><span class="emoji">😎</span><span class="label">Dễ</span><span class="interval" id="${pfx}i3"></span></button>
    </div>`
}

function toggleHint(contentId: string, btn: HTMLElement, showLabel: string, hideLabel: string) {
  const c = $(contentId)!
  if (c.style.display === 'none') { c.style.display = 'block'; btn.textContent = hideLabel }
  else { c.style.display = 'none'; btn.textContent = showLabel }
}

function showCharHint(displayId: string, btn: HTMLElement, zh: string) {
  const d = $(displayId)!
  d.innerHTML = getCharHint(zh) || ''
  d.style.display = 'block'; btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = '🔍 Đã gợi ý'
}

function checkAnswer(): void {
  if (answered) return
  const inp = $('answer-input') as HTMLInputElement
  if (!inp?.value.trim()) return
  setAnswered(true)
  const ok = inp.value.trim() === currentCard!.zh
  const { reviewCorrect: rc, reviewTotal: rt, reviewInitial: ri, reviewWrong: rw } = { reviewCorrect, reviewTotal, reviewInitial, reviewWrong }
  if (!ok && !rw.find((x: any) => x.id === currentCard!.id)) rw.push(currentCard!)
  setReviewStats(ok ? rc + 1 : rc, rt + 1, ri, rw)
  db.total++; if (ok) db.correct++
  const today = new Date().toISOString().split('T')[0]
  db.sessions[today] = (db.sessions[today] || 0) + 1
  save()
  const fb = $('feedback-bar')!, ca = $('correct-ans')!
  if (ok) { inp.classList.add('correct'); fb.className = 'feedback-bar correct'; fb.textContent = '✓ Chính xác!'; ca.style.display = 'none' }
  else { inp.classList.add('wrong'); fb.className = 'feedback-bar wrong'; fb.textContent = '✗ Sai rồi!'; ca.style.display = 'block'; ca.textContent = `Đáp án đúng: ${tr(currentCard!.zh)} (${currentCard!.pinyin})` }
  $('diff-btns')!.style.display = 'grid'; $('check-btn')!.textContent = 'Chọn mức độ khó →'; ($('check-btn') as HTMLButtonElement).disabled = true
  for (let g = 0; g < 4; g++) { const el = $(`i${g}`); if (el) el.textContent = intLabel(g, currentCard!) }
}

function gradeCard(g: number): void {
  const w = db.words.find(x => x.id === currentCard!.id)
  if (w) { sm2(w, g); save() }
  reviewQueue.shift(); setAnswered(false); renderReviewCard()
}

// ─── Article review ────────────────────────────────────────────────────────────
export function startArticleReview(): void {
  const article = db.articles.find(a => a.id === currentArticleId)
  if (!article) { toast('Không tìm thấy bài báo!'); return }
  const ids = article.linkedWords || []
  if (!ids.length) { toast('Bài báo này chưa có từ nào!'); return }
  const words = db.words.filter(w => ids.includes(w.id))
  if (!words.length) { toast('Không tìm thấy từ!'); return }
  setArtReviewQueue(words.map(w => ({ ...w })).sort(() => Math.random() - 0.5))
  setArtReviewStats(0, 0, artReviewQueue.length)
  setArtReviewAnswered(false); setArtReviewCard(null)
  ;($('art-review-title') as HTMLElement).textContent = article.title
  nav('article-review')
  renderArtReviewCard()
}

export function renderArtReviewCard(): void {
  const rc = $('art-review-content')!
  if (!artReviewQueue.length) {
    const pct = artReviewTotal > 0 ? Math.round(artReviewCorrect / artReviewTotal * 100) : 0
    const grade = pct >= 90 ? '🏆 Xuất sắc!' : pct >= 70 ? '🎉 Tốt lắm!' : pct >= 50 ? '💪 Cần cố thêm!' : '📚 Hãy ôn thêm nhé!'
    rc.innerHTML = `<div class="review-card" style="text-align:center">
      <div style="font-size:52px;margin-bottom:16px">${pct >= 70 ? '🎉' : '📖'}</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:6px">${grade}</div>
      <div style="font-size:14px;color:var(--text2);margin-bottom:28px">Bạn đã hoàn thành luyện tập</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:28px">
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--border)"><div style="font-size:28px;font-weight:700">${artReviewInitial}</div><div style="font-size:11px;color:var(--text3);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Từ đã học</div></div>
        <div style="background:var(--green-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--green-border)"><div style="font-size:28px;font-weight:700;color:var(--green)">${artReviewCorrect}</div><div style="font-size:11px;color:var(--green);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Trả lời đúng</div></div>
        <div style="background:var(--red-light);border-radius:var(--radius-sm);padding:16px 10px;border:1px solid var(--red-mid)"><div style="font-size:28px;font-weight:700;color:var(--red)">${pct}%</div><div style="font-size:11px;color:var(--red);margin-top:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Độ chính xác</div></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="submit-btn" id="art-review-again-btn" style="padding:11px 24px">🔄 Luyện lại</button>
        <button id="art-review-done-btn" style="padding:11px 24px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">← Về bài báo</button>
      </div></div>`
    $('art-review-again-btn')?.addEventListener('click', startArticleReview)
    $('art-review-done-btn')?.addEventListener('click', () => nav('read-article'))
    return
  }
  setArtReviewCard(artReviewQueue[0])
  const done = artReviewInitial - artReviewQueue.length
  rc.innerHTML = `<div style="font-size:12px;color:var(--text3);text-align:right;margin-bottom:14px;margin-top:-20px">${done}/${artReviewInitial} từ · ${artReviewCorrect} đúng</div>` +
    buildReviewCardHtml(artReviewCard!, done, artReviewInitial, true)
  const inp = $('art-answer-input') as HTMLInputElement
  inp?.focus()
  inp?.addEventListener('input', () => { const el = $('art-live-pinyin'); if (el) el.textContent = getPinyin(inp.value) })
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') artCheckAnswer() })
  $('art-check-btn')?.addEventListener('click', artCheckAnswer)
  rc.querySelectorAll('.diff-btn').forEach(btn =>
    btn.addEventListener('click', () => artGradeCard(parseInt((btn as HTMLElement).dataset.grade!)))
  )
  const h = $('art-hint-toggle-btn')
  if (h) h.addEventListener('click', () => toggleHint('art-hint-content', h as HTMLElement, '💡 Xem gợi ý', '💡 Ẩn gợi ý'))
  const ch = $('art-char-hint-btn')
  if (ch) ch.addEventListener('click', () => showCharHint('art-char-hint-display', ch as HTMLElement, artReviewCard!.zh))
  setupReviewDictLookup($('art-review-content')!)
  setArtReviewAnswered(false)
}

function artCheckAnswer(): void {
  if (artReviewAnswered) return
  const inp = $('art-answer-input') as HTMLInputElement
  if (!inp?.value.trim()) return
  setArtReviewAnswered(true)
  const ok = inp.value.trim() === artReviewCard!.zh
  setArtReviewStats(ok ? artReviewCorrect + 1 : artReviewCorrect, artReviewTotal + 1, artReviewInitial)
  const fb = $('art-feedback-bar')!, ca = $('art-correct-ans')!
  if (ok) { inp.classList.add('correct'); fb.className = 'feedback-bar correct'; fb.textContent = '✓ Chính xác!'; ca.style.display = 'none' }
  else { inp.classList.add('wrong'); fb.className = 'feedback-bar wrong'; fb.textContent = '✗ Sai rồi!'; ca.style.display = 'block'; ca.textContent = `Đáp án đúng: ${tr(artReviewCard!.zh)} (${artReviewCard!.pinyin})` }
  $('art-diff-btns')!.style.display = 'grid'; $('art-check-btn')!.textContent = 'Chọn mức độ khó →'; ($('art-check-btn') as HTMLButtonElement).disabled = true
  for (let g = 0; g < 4; g++) { const el = $(`ai${g}`); if (el) el.textContent = intLabel(g, artReviewCard!) }
}

function artGradeCard(g: number): void {
  sm2Local(artReviewCard!, g)
  artReviewQueue.shift()
  if (g === 0 && artReviewQueue.length > 0) {
    const slot = Math.min(3, artReviewQueue.length)
    artReviewQueue.splice(slot, 0, { ...artReviewCard! })
  }
  setArtReviewAnswered(false); renderArtReviewCard()
}
