import { db, hskState, currentUserId } from '../state'
import { firestore, auth } from '../firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import HanziWriter from 'hanzi-writer'
import { getPinyin, toast, $, tr, buildWordTypeSelector } from '../utils'
import { save } from '../sync'
import { nav } from '../router'
import { HSK_BOOKS } from '../data/hsk-books'
// @ts-ignore
import hsk2Data from '../../data/hsk2.json'
// @ts-ignore
import hsk3Data from '../../data/hsk3.json'
// @ts-ignore
import hsk4Data from '../../data/hsk4.json'

// ── Module-level state (replaces window._hskModal*) ──────────────────────────
let _hskModalWord: any = null
let _hskModalSelectedType = ''

// ── Helpers ───────────────────────────────────────────────────────────────────
function hskGetBook(id: string | null) {
  if (!id) return null
  return HSK_BOOKS.find(b => b.id === id) || null
}

function hskCountAdded(bookId: string, unitIndex: number | null): number {
  const book = hskGetBook(bookId)
  if (!book) return 0
  const words =
    unitIndex != null
      ? (book.units[unitIndex]?.words || [])
      : book.units.flatMap(u => u.words)
  return words.filter(w => hskIsInDict(w.zh) || hskIsMemorized(w.zh)).length
}

function hskIsInDict(zh: string): boolean {
  return db.words.some(w => w.zh === zh)
}

function hskIsMemorized(zh: string): boolean {
  return ((db.memorized as any[]) || []).includes(zh)
}

function hskGetSRSInfo(zh: string) {
  const w = db.words.find(x => x.zh === zh)
  if (!w) return null
  const sl: Record<string, string> = {
    new: 'Mới',
    learning: 'Đang học',
    review: 'Ôn tập',
    mastered: 'Thành thạo',
  }
  const sc: Record<string, string> = {
    new: '#A09D96',
    learning: '#0284C7',
    review: '#9333EA',
    mastered: '#177A47',
  }
  const nextReview = w.nextReview
    ? new Date(w.nextReview).toLocaleDateString('vi-VN')
    : 'Ngay bây giờ'
  return {
    status: sl[w.status] || 'Mới',
    color: sc[w.status] || '#A09D96',
    next: nextReview,
  }
}

// ── Lazy-load book data from local JSON ───────────────────────────────────────
const _hskLoadingBooks = new Set<string>()

async function hskLoadBookData(bookId: string): Promise<void> {
  const book = hskGetBook(bookId)
  if (!book || book.units.length > 0) return
  if (_hskLoadingBooks.has(bookId)) return

  _hskLoadingBooks.add(bookId)
  const descEl = $('hsk-book-desc')
  const gridEl = $('hsk-units-grid')
  if (descEl) descEl.textContent = 'Đang tải dữ liệu...'
  if (gridEl)
    gridEl.innerHTML =
      '<div style="padding:24px;text-align:center;color:var(--text3)">⏳ Đang tải từ vựng...</div>'

  try {
    let data: any = null
    if (bookId === 'hsk2') data = hsk2Data
    else if (bookId === 'hsk3') data = hsk3Data
    else if (bookId === 'hsk4') data = hsk4Data
    if (!data) throw new Error('No local data for ' + bookId)

    book.units = data.units || []
    book.desc = data.desc || book.desc
    book.icon = data.icon || book.icon
    hskRenderUnits()
  } catch (e) {
    console.warn('hskLoadBookData error:', e)
    if (descEl) descEl.textContent = '⚠️ Không tải được dữ liệu.'
    if (gridEl)
      gridEl.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--red)">Tải thất bại. Thử lại sau.</div>'
  } finally {
    _hskLoadingBooks.delete(bookId)
  }
}

// ── Nav ───────────────────────────────────────────────────────────────────────
export async function hskNav(
  view: string,
  bookId: string | null = null,
  unitIndex: number | null = null,
  wordIndex: number | null = null,
): Promise<void> {
  hskState.view = view
  hskState.bookId = bookId
  hskState.unitIndex = unitIndex
  hskState.wordIndex = wordIndex
  if (view === 'words' && bookId) await hskLoadTipsFromFirestore(bookId)
  ;['hsk-view-books', 'hsk-view-units', 'hsk-view-words'].forEach(id => {
    const el = $(id)
    if (el) el.style.display = 'none'
  })
  const viewEl = $(`hsk-view-${view}`)
  if (viewEl) viewEl.style.display = ''
  hskRenderBreadcrumb()
  if (view === 'books') hskRenderBooks()
  if (view === 'units') hskRenderUnits()
  if (view === 'words') hskRenderWords()
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function hskRenderBreadcrumb(): void {
  const el = $('hsk-breadcrumb')
  if (!el) return
  const { view, bookId, unitIndex } = hskState
  if (view === 'books') {
    el.style.display = 'none'
    return
  }
  el.style.display = 'flex'
  const book = hskGetBook(bookId)
  const parts: Array<{ label: string; onclick: () => void; isCurrent?: boolean }> = [
    { label: '📚 Sách HSK', onclick: () => hskNav('books') },
  ]
  if (book) parts.push({ label: book.title, onclick: () => hskNav('units', bookId) })
  if (unitIndex != null && book) {
    const label =
      book.units[unitIndex]?.title?.split(':')[0] || `Unit ${unitIndex + 1}`
    const isCurrent = view === 'words'
    parts.push({
      label,
      onclick: () => hskNav('words', bookId, unitIndex),
      isCurrent,
    })
  } else if (view === 'units') {
    parts[parts.length - 1].isCurrent = true
  } else {
    parts[parts.length - 1].isCurrent = true
  }

  el.innerHTML = parts
    .map((p, i) => {
      const isLast = i === parts.length - 1
      const sep = i > 0 ? `<span class="hsk-breadcrumb-sep">›</span>` : ''
      if (isLast || p.isCurrent) {
        return `${sep}<span class="hsk-breadcrumb-current">${p.label}</span>`
      }
      return `${sep}<span class="hsk-breadcrumb-item" data-bc="${i}">${p.label}</span>`
    })
    .join('')
  el.querySelectorAll('[data-bc]').forEach(btn => {
    const i = parseInt((btn as HTMLElement).dataset.bc!)
    btn.addEventListener('click', parts[i].onclick)
  })
}

// ── Book list ─────────────────────────────────────────────────────────────────
function hskRenderBooks(): void {
  const grid = $('hsk-books-grid')
  if (!grid) return
  grid.innerHTML = HSK_BOOKS.map(book => {
    const total = book.units.flatMap(u => u.words).length
    const added = hskCountAdded(book.id, null)
    const pct = total > 0 ? Math.round((added / total) * 100) : 0
    return `
    <div class="hsk-book-card level-${book.level}" data-book="${book.id}" style="cursor:pointer">
      <span class="hsk-book-icon">${book.icon}</span>
      <div class="hsk-book-name">${book.title}</div>
      <div class="hsk-book-meta">${book.units.length} units · ${total} từ vựng</div>
      <div class="hsk-book-progress-bar">
        <div class="hsk-book-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="hsk-book-progress-text">${added}/${total} từ đã thêm vào từ điển (${pct}%)</div>
    </div>`
  }).join('')
  grid.querySelectorAll('[data-book]').forEach(card => {
    card.addEventListener('click', () =>
      hskNav('units', (card as HTMLElement).dataset.book!),
    )
  })
}

// ── Unit list ─────────────────────────────────────────────────────────────────
function hskRenderUnits(): void {
  const book = hskGetBook(hskState.bookId)
  if (!book) return
  const titleEl = $('hsk-book-title')
  const descEl = $('hsk-book-desc')
  if (titleEl) titleEl.textContent = `${book.icon} ${book.title}`
  if (descEl) descEl.textContent = book.desc
  const qlBtn = $('hsk-quicklearn-btn')
  if (qlBtn) (qlBtn as HTMLButtonElement).onclick = () => hskOpenQuickLearn()
  const grid = $('hsk-units-grid')
  if (!grid) return

  // Reset search state on every navigation to this view
  const searchInp = $('hsk-unit-search') as HTMLInputElement | null
  const resultsEl = $('hsk-search-results')
  if (searchInp) { searchInp.value = ''; searchInp.oninput = null }
  if (resultsEl) { resultsEl.style.display = 'none'; resultsEl.innerHTML = '' }
  grid.style.display = ''

  if (book.units.length === 0) {
    hskLoadBookData(hskState.bookId!)
    return
  }
  grid.innerHTML = book.units
    .map((unit, i) => {
      const total = unit.words.length
      const added = hskCountAdded(book.id, i)
      const addedBadge =
        added > 0
          ? `<span class="hsk-unit-added-badge">✓ ${added}/${total} từ</span>`
          : `<span style="font-size:11px;color:var(--text4)">${total} từ</span>`
      return `
    <div class="hsk-unit-card" data-unit="${i}">
      <div class="hsk-unit-number">${i + 1}</div>
      <div class="hsk-unit-info">
        <div class="hsk-unit-name">${unit.title}</div>
        <div class="hsk-unit-count">${addedBadge}</div>
      </div>
      <span class="hsk-unit-arrow">›</span>
    </div>`
    })
    .join('')
  grid.querySelectorAll('[data-unit]').forEach(card => {
    card.addEventListener('click', () =>
      hskNav(
        'words',
        hskState.bookId,
        parseInt((card as HTMLElement).dataset.unit!),
      ),
    )
  })

  // ── Search ──────────────────────────────────────────────────────────────────
  if (!searchInp || !resultsEl) return
  searchInp.oninput = () => {
    const q = searchInp.value.trim().toLowerCase()
    if (!q) {
      resultsEl.style.display = 'none'
      grid.style.display = ''
      return
    }
    type Match = { ui: number; wi: number; unit: (typeof book.units)[0]; word: (typeof book.units)[0]['words'][0] }
    const matches: Match[] = []
    book.units.forEach((unit, ui) => {
      unit.words.forEach((word, wi) => {
        if ((word.zh || '').includes(q) || (word.vi || '').toLowerCase().includes(q)) {
          matches.push({ ui, wi, unit, word })
        }
      })
    })
    grid.style.display = 'none'
    resultsEl.style.display = ''
    if (!matches.length) {
      resultsEl.innerHTML = `<p class="hsk-search-empty">Không tìm thấy từ nào khớp với "<strong>${q}</strong>"</p>`
      return
    }
    resultsEl.innerHTML = matches.map(m => {
      const pin = getPinyin(m.word.zh) || ''
      const addedBadge = hskIsInDict(m.word.zh) ? `<span class="hsk-sr-added">✓ Đã thêm</span>` : ''
      const unitShort = (m.unit.title || '').split(':')[0]?.trim() || `Unit ${m.ui + 1}`
      return `<div class="hsk-search-result" data-ui="${m.ui}" data-wi="${m.wi}">
        <div class="hsk-sr-zh">${m.word.zh}</div>
        <div style="flex:1;min-width:0">
          <div class="hsk-sr-pin">${pin}</div>
          <div class="hsk-sr-vi">${m.word.vi || ''}</div>
        </div>
        ${addedBadge}
        <span class="hsk-sr-unit">${unitShort}</span>
      </div>`
    }).join('')
    resultsEl.querySelectorAll('.hsk-search-result').forEach(r => {
      r.addEventListener('click', () => {
        hskNav('words', hskState.bookId,
          parseInt((r as HTMLElement).dataset.ui!),
          parseInt((r as HTMLElement).dataset.wi!),
        )
      })
    })
  }
}

// ── Component-tip lookup ──────────────────────────────────────────────────────
// For a multi-char word like 请进, returns tips for 请 and 进 individually
// (searches all currently-loaded HSK books).
function hskGetComponentTips(zh: string): Array<{ zh: string; vi: string; tip: string }> {
  const chars = [...zh]
  if (chars.length <= 1) return []
  const results: Array<{ zh: string; vi: string; tip: string }> = []
  const seen = new Set<string>()
  for (const ch of chars) {
    if (seen.has(ch)) continue
    seen.add(ch)
    outer: for (const book of HSK_BOOKS) {
      for (const unit of book.units) {
        const found = unit.words.find(w => w.zh === ch && w.memoryTip)
        if (found) { results.push({ zh: ch, vi: found.vi, tip: found.memoryTip! }); break outer }
      }
    }
  }
  return results
}

// ── Word list ─────────────────────────────────────────────────────────────────
function hskRenderWords(): void {
  const book = hskGetBook(hskState.bookId)
  const unit = book?.units[hskState.unitIndex!]
  if (!unit) return
  if (hskState.wordIndex == null) hskState.wordIndex = 0
  hskRenderWordReader()
}

// ── Single-word reader ────────────────────────────────────────────────────────
let _hskWriters: any[] = []

function hskRenderWordReader(): void {
  const book = hskGetBook(hskState.bookId)
  const unit = book?.units[hskState.unitIndex!]
  const words = unit?.words || []
  const idx = hskState.wordIndex ?? 0
  const word = words[idx]
  if (!word) return

  // Clean up old HanziWriter instances
  _hskWriters.forEach(w => {
    try {
      w.cancelQuiz()
    } catch (e) {}
  })
  _hskWriters = []

  const inDict = hskIsInDict(word.zh)
  const isMastered = currentUserId ? hskIsMemorized(word.zh) : false
  const srs = hskGetSRSInfo(word.zh)
  const chars = [...word.zh]
  const pinyin = getPinyin(word.zh)
  const hasPrev = idx > 0
  const hasNext = idx < words.length - 1
  const isAdmin = auth.currentUser?.email === 'hoang1886@gmail.com'

  // Progress dots (max 20 shown)
  const maxDots = Math.min(words.length, 20)
  const dots = Array.from({ length: maxDots }, (_, i) => {
    const actual = Math.floor((i * words.length) / maxDots)
    const active = actual === idx
    const done =
      hskIsInDict(words[actual]?.zh) || hskIsMemorized(words[actual]?.zh)
    return `<div class="hsk-dot ${active ? 'active' : done ? 'done' : ''}" data-i="${actual}"></div>`
  }).join('')

  // Stroke boxes
  const size = chars.length === 1 ? 160 : 110
  const strokeBoxes = chars
    .map(
      (c, i) => `
    <div class="hsk-stroke-box">
      <div id="hsk-stroke-${i}" class="hsk-stroke-canvas"></div>
      ${chars.length > 1 ? `<div class="hsk-stroke-char-label">${c}</div>` : ''}
    </div>`,
    )
    .join('')

  // SRS badge
  const srsBadge = srs
    ? `<span class="hsk-srs-badge" style="background:${srs.color}22;color:${srs.color};border-color:${srs.color}44">${srs.status} · ôn ${srs.next}</span>`
    : ''

  // Admin buttons
  const adminBtn = isAdmin
    ? `<button class="hsk-admin-btn" id="hsk-admin-add-btn">⚙️ Thêm từ mới vào unit</button>
       <button class="hsk-admin-btn" id="hsk-admin-tip-btn">✏️ ${word.memoryTip ? 'Sửa mẹo nhớ' : 'Thêm mẹo nhớ'}</button>`
    : ''

  // Component tips (for multi-char words, e.g. 请进 → show tip for 请 and 进)
  const compTips = hskGetComponentTips(word.zh)
  const compTipsHtml = compTips.length
    ? `<div class="hsk-card-section-label" style="margin-top:20px">🧩 MẸO NHỚ THÀNH PHẦN</div>
       ${compTips.map(t => `
       <div class="hsk-comp-tip">
         <div class="hsk-comp-tip-header">
           <span class="hsk-comp-tip-zh">${tr(t.zh)}</span>
           <span class="hsk-comp-tip-vi">${t.vi}</span>
         </div>
         <div class="hsk-comp-tip-text">${t.tip.replace(/\n/g, '<br>')}</div>
       </div>`).join('')}`
    : ''

  const reader = $('hsk-word-reader')
  if (!reader) return

  reader.innerHTML = `
    <!-- Top bar: unit name + progress -->
    <div class="hsk-reader-topbar">
      <div class="hsk-reader-unit-name">${unit.title}</div>
      <div class="hsk-reader-counter">${idx + 1} / ${words.length}</div>
    </div>
    <div class="hsk-reader-dots">${dots}</div>

    <!-- Main layout: prev arrow | card | next arrow -->
    <div class="hsk-reader-layout">
      <button class="hsk-arrow-btn hsk-arrow-prev" id="hsk-arr-prev" ${hasPrev ? '' : 'disabled'} title="Từ trước">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <div class="hsk-reader-card">
        <!-- Header: số thứ tự + chữ lớn -->
        <div class="hsk-card-header">
          <div class="hsk-card-index">${idx + 1}</div>
          <div class="hsk-card-zh">${tr(word.zh)}</div>
          <div class="hsk-card-py">${pinyin}</div>
          <div class="hsk-card-vi">${word.vi}</div>
          ${srsBadge}
          <div class="hsk-card-actions">
            ${
              isMastered
                ? `<button class="hsk-detail-add-btn added" disabled title="Từ này đã thuộc lòng, không cần học SRS">🎓 Đã thuộc lòng</button>`
                : inDict
                  ? `<button class="hsk-detail-add-btn added" disabled>✓ Đã có trong từ điển</button>`
                  : `<button class="hsk-detail-add-btn" id="hsk-add-btn">＋ Thêm vào từ điển</button>`
            }
            ${
              isMastered
                ? `<button class="hsk-memorized-btn done" disabled>✓ Đã thuộc</button>`
                : `<button class="hsk-memorized-btn" id="hsk-memorized-btn">🎓 Thuộc lòng rồi</button>`
            }
            ${adminBtn}
          </div>
        </div>

        <!-- Body: two-column PREP style -->
        <div class="hsk-card-body">
          <!-- Left col -->
          <div class="hsk-card-left">
            <div class="hsk-card-section-label">ÂM HÁN VIỆT</div>
            <div class="hsk-card-hanviet">${word.hanViet || '—'}</div>

            <div class="hsk-card-section-label" style="margin-top:20px">BÚT THUẬN (STROKE ORDER)</div>
            <div id="hsk-stroke-container">${strokeBoxes}</div>
            <div class="hsk-stroke-controls">
              <button class="hsk-stroke-btn primary" id="hsk-stroke-animate">▶ Animation</button>
              <button class="hsk-stroke-btn" id="hsk-stroke-quiz">✏️ Luyện viết</button>
              <button class="hsk-stroke-btn" id="hsk-stroke-reset">↺ Reset</button>
            </div>
          </div>

          <!-- Right col -->
          <div class="hsk-card-right">
            ${
              word.zhDef
                ? `
            <div class="hsk-card-section-label">ĐỊNH NGHĨA TIẾNG TRUNG</div>
            <div class="hsk-card-zhdef">${tr(word.zhDef)}</div>`
                : ''
            }

            ${
              word.memoryTip
                ? `
            <div class="hsk-card-section-label" style="margin-top:20px">💡 MẸO NHỚ</div>
            <div class="hsk-card-tip">${word.memoryTip.replace(/\n/g, '<br>')}</div>`
                : ''
            }

            ${compTipsHtml}

            ${
              word.exZh
                ? `
            <div class="hsk-card-section-label" style="margin-top:20px">💬 VÍ DỤ</div>
            <div class="hsk-card-ex">
              <div class="hsk-card-ex-zh">${tr(word.exZh)}</div>
              <div class="hsk-card-ex-py">${getPinyin(word.exZh)}</div>
              <div class="hsk-card-ex-vi">${word.exVi || ''}</div>
            </div>`
                : ''
            }
          </div>
        </div>
      </div>

      <button class="hsk-arrow-btn hsk-arrow-next" id="hsk-arr-next" ${hasNext ? '' : 'disabled'} title="Từ tiếp theo">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <!-- Admin: memory tip editor (hidden by default) -->
    ${
      isAdmin
        ? `<div id="hsk-tip-editor" style="display:none;margin-top:16px;background:var(--surface2);border:1.5px solid #7C3AED44;border-radius:12px;padding:18px 20px">
      <div style="font-size:12px;font-weight:700;color:#7C3AED;letter-spacing:0.07em;margin-bottom:10px">✏️ MẸO NHỚ (ADMIN — hiển thị cho tất cả user)</div>
      <div id="hsk-fmt-toolbar" style="display:flex;flex-direction:row;gap:4px;margin-bottom:8px;flex-wrap:wrap">
        <button type="button" class="hsk-tip-fmt-btn" data-tag="b" title="In đậm (Ctrl+B)" style="min-width:32px;height:32px;padding:0 8px;border-radius:6px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text);font-size:14px;font-weight:700;cursor:pointer;font-family:serif;line-height:1">B</button>
        <button type="button" class="hsk-tip-fmt-btn" data-tag="i" title="In nghiêng (Ctrl+I)" style="min-width:32px;height:32px;padding:0 8px;border-radius:6px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text);font-size:14px;cursor:pointer;font-style:italic;font-family:serif;line-height:1">I</button>
        <button type="button" class="hsk-tip-fmt-btn" data-tag="u" title="Gạch chân (Ctrl+U)" style="min-width:32px;height:32px;padding:0 8px;border-radius:6px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text);font-size:14px;cursor:pointer;text-decoration:underline;font-family:serif;line-height:1">U</button>
        <div style="width:1px;height:24px;background:var(--border2);align-self:center;margin:0 2px"></div>
        <button type="button" class="hsk-tip-fmt-btn" data-tag="mark" title="Highlight vàng" style="min-width:32px;height:32px;padding:0 8px;border-radius:6px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text);font-size:13px;cursor:pointer;line-height:1">🖊</button>
      </div>
      <textarea id="hsk-tip-inp" rows="5" placeholder="Nhập mẹo nhớ... Chọn chữ rồi bấm B/I/U để định dạng" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--border2);background:var(--surface);color:var(--text);font-size:13px;font-family:'Be Vietnam Pro',sans-serif;outline:none;resize:vertical;box-sizing:border-box;line-height:1.7">${word.memoryTip || ''}</textarea>
      <div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap">
        <button id="hsk-tip-save-btn" style="padding:8px 20px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Be Vietnam Pro',sans-serif">💾 Lưu mẹo nhớ</button>
        <button id="hsk-tip-cancel-btn" style="padding:8px 16px;background:var(--surface);border:1.5px solid var(--border2);border-radius:8px;font-size:13px;cursor:pointer;color:var(--text2);font-family:'Be Vietnam Pro',sans-serif">Huỷ</button>
        <span style="font-size:11px;color:var(--text3)">Ctrl+B / Ctrl+I / Ctrl+U</span>
      </div>
    </div>`
        : ''
    }

    <!-- Admin: add word form (hidden by default) -->
    ${
      isAdmin
        ? `<div id="hsk-admin-form" class="hsk-admin-form" style="display:none">
      <div class="hsk-admin-form-title">⚙️ Thêm từ mới vào "${unit.title}"</div>
      <div class="hsk-admin-grid">
        <div class="hsk-admin-field"><label>Chữ Hán *</label><input id="adm-zh" placeholder="e.g. 学习" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field"><label>Nghĩa tiếng Việt *</label><input id="adm-vi" placeholder="e.g. học tập"></div>
        <div class="hsk-admin-field"><label>Âm Hán Việt</label><input id="adm-hanviet" placeholder="e.g. học tập"></div>
        <div class="hsk-admin-field"><label>Định nghĩa tiếng Trung</label><input id="adm-zhdef" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field hsk-admin-full"><label>Mẹo nhớ</label><textarea id="adm-tip" rows="3" placeholder="Giải thích, mẹo nhớ..."></textarea></div>
        <div class="hsk-admin-field"><label>Ví dụ (tiếng Trung)</label><input id="adm-exzh" style="font-family:'Noto Sans SC',sans-serif"></div>
        <div class="hsk-admin-field"><label>Ví dụ (tiếng Việt)</label><input id="adm-exvi"></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="hsk-stroke-btn primary" id="adm-save-btn" style="padding:10px 24px">💾 Lưu từ mới</button>
        <button class="hsk-stroke-btn" id="adm-cancel-btn" style="padding:10px 20px">Huỷ</button>
      </div>
    </div>`
        : ''
    }
  `

  // Init HanziWriter
  chars.forEach((c, i) => {
    try {
      const writer = HanziWriter.create(`hsk-stroke-${i}`, c, {
        width: size,
        height: size,
        padding: 6,
        strokeColor: '#C8281E',
        outlineColor: 'rgba(200,200,200,0.5)',
        drawingColor: '#177A47',
        drawingWidth: 4,
        showCharacter: true,
        showOutline: true,
        strokeAnimationSpeed: 0.8,
        delayBetweenStrokes: 280,
      })
      _hskWriters.push(writer)
    } catch (e) {}
  })

  // Stroke controls
  $('hsk-stroke-animate')?.addEventListener('click', () =>
    _hskWriters.forEach(w => w.animateCharacter()),
  )
  $('hsk-stroke-quiz')?.addEventListener('click', () =>
    _hskWriters.forEach(w =>
      w.quiz({ onComplete: () => toast('✓ Viết xong rồi!') }),
    ),
  )
  $('hsk-stroke-reset')?.addEventListener('click', () =>
    _hskWriters.forEach(w => {
      w.cancelQuiz()
      w.showCharacter()
    }),
  )

  // Add to dict
  $('hsk-add-btn')?.addEventListener('click', () => hskAddWordToDict(word))
  // Mark as memorized
  $('hsk-memorized-btn')?.addEventListener('click', () =>
    hskMarkMemorized(word),
  )

  // Arrow navigation
  $('hsk-arr-prev')?.addEventListener('click', () => {
    if (hasPrev) {
      hskState.wordIndex = idx - 1
      hskRenderWordReader()
      scrollToReader()
    }
  })
  $('hsk-arr-next')?.addEventListener('click', () => {
    if (hasNext) {
      hskState.wordIndex = idx + 1
      hskRenderWordReader()
      scrollToReader()
    }
  })

  // Dot navigation
  reader.querySelectorAll('.hsk-dot[data-i]').forEach(dot => {
    dot.addEventListener('click', () => {
      hskState.wordIndex = parseInt((dot as HTMLElement).dataset.i!)
      hskRenderWordReader()
      scrollToReader()
    })
  })

  // Keyboard navigation
  ;(reader as any)._keyHandler &&
    document.removeEventListener('keydown', (reader as any)._keyHandler)
  ;(reader as any)._keyHandler = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return
    if (e.key === 'ArrowRight' && hasNext) {
      hskState.wordIndex = idx + 1
      hskRenderWordReader()
      scrollToReader()
    }
    if (e.key === 'ArrowLeft' && hasPrev) {
      hskState.wordIndex = idx - 1
      hskRenderWordReader()
      scrollToReader()
    }
  }
  document.addEventListener('keydown', (reader as any)._keyHandler)

  // Admin form
  if (isAdmin) {
    $('hsk-admin-add-btn')?.addEventListener('click', () => {
      const f = $('hsk-admin-form')
      if (!f) return
      f.style.display = f.style.display === 'none' ? 'block' : 'none'
      const te = $('hsk-tip-editor')
      if (te) te.style.display = 'none'
    })
    $('adm-cancel-btn')?.addEventListener('click', () => {
      const f = $('hsk-admin-form')
      if (f) f.style.display = 'none'
    })
    $('adm-save-btn')?.addEventListener('click', () =>
      hskAdminSaveWord(book!, hskState.unitIndex!),
    )

    // Memory tip editor
    $('hsk-admin-tip-btn')?.addEventListener('click', () => {
      const te = $('hsk-tip-editor')
      if (!te) return
      te.style.display = te.style.display === 'none' ? 'block' : 'none'
      const f = $('hsk-admin-form')
      if (f) f.style.display = 'none'
      if (te.style.display === 'block') $('hsk-tip-inp')?.focus()
    })
    $('hsk-tip-cancel-btn')?.addEventListener('click', () => {
      const te = $('hsk-tip-editor')
      if (te) te.style.display = 'none'
    })
    $('hsk-tip-save-btn')?.addEventListener('click', () =>
      hskAdminSaveTip(book!, hskState.unitIndex!, idx),
    )

    // ── B/I/U formatting toolbar ─────────────────────────────────────────────
    function applyFmt(tag: string) {
      const ta = $('hsk-tip-inp') as HTMLTextAreaElement | null
      if (!ta) return
      const s = ta.selectionStart,
        e = ta.selectionEnd
      const sel = ta.value.slice(s, e)
      if (s === e) {
        ta.setRangeText('<' + tag + '></' + tag + '>', s, e, 'end')
        const cur = s + tag.length + 2
        ta.setSelectionRange(cur, cur)
      } else {
        ta.setRangeText(
          '<' + tag + '>' + sel + '</' + tag + '>',
          s,
          e,
          'end',
        )
      }
      ta.focus()
    }

    document.querySelectorAll('.hsk-tip-fmt-btn').forEach(btn => {
      btn.addEventListener('mousedown', ev => {
        ev.preventDefault()
        applyFmt((btn as HTMLElement).dataset.tag!)
        ;(btn as HTMLElement).style.background = 'var(--surface2)'
        ;(btn as HTMLElement).style.borderColor = '#7C3AED'
        setTimeout(() => {
          ;(btn as HTMLElement).style.background = ''
          ;(btn as HTMLElement).style.borderColor = ''
        }, 250)
      })
    })

    $('hsk-tip-inp')?.addEventListener('keydown', ev => {
      const ke = ev as KeyboardEvent
      if (ke.ctrlKey || ke.metaKey) {
        if (ke.key === 'b') {
          ke.preventDefault()
          applyFmt('b')
        }
        if (ke.key === 'i') {
          ke.preventDefault()
          applyFmt('i')
        }
        if (ke.key === 'u') {
          ke.preventDefault()
          applyFmt('u')
        }
      }
    })
  }
}

function scrollToReader(): void {
  $('hsk-word-reader')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── Admin: save new word to book data ────────────────────────────────────────
function hskAdminSaveWord(book: any, unitIndex: number): void {
  const zh = ($('adm-zh') as HTMLInputElement | null)?.value.trim()
  const vi = ($('adm-vi') as HTMLInputElement | null)?.value.trim()
  if (!zh || !vi) {
    toast('⚠️ Vui lòng nhập Chữ Hán và nghĩa!')
    return
  }
  const newWord = {
    zh,
    vi,
    hanViet: ($('adm-hanviet') as HTMLInputElement | null)?.value.trim() || '',
    zhDef: ($('adm-zhdef') as HTMLInputElement | null)?.value.trim() || '',
    memoryTip: ($('adm-tip') as HTMLTextAreaElement | null)?.value.trim() || '',
    exZh: ($('adm-exzh') as HTMLInputElement | null)?.value.trim() || '',
    exVi: ($('adm-exvi') as HTMLInputElement | null)?.value.trim() || '',
  }
  book.units[unitIndex].words.push(newWord)
  hskSaveAdminData(book)
  const f = $('hsk-admin-form')
  if (f) f.style.display = 'none'
  ;['adm-zh', 'adm-vi', 'adm-hanviet', 'adm-zhdef', 'adm-tip', 'adm-exzh', 'adm-exvi'].forEach(
    id => {
      const el = $(id) as HTMLInputElement | null
      if (el) el.value = ''
    },
  )
  hskState.wordIndex = book.units[unitIndex].words.length - 1
  hskRenderWordReader()
  toast(`✓ Đã thêm từ "${zh}" vào unit!`)
}

function hskAdminSaveTip(
  book: any,
  unitIndex: number,
  wordIndex: number,
): void {
  const tip =
    ($('hsk-tip-inp') as HTMLTextAreaElement | null)?.value.trim() || ''
  book.units[unitIndex].words[wordIndex].memoryTip = tip
  hskSaveAdminData(book)
  const te = $('hsk-tip-editor')
  if (te) te.style.display = 'none'
  hskRenderWordReader()
  toast(
    `✓ Đã lưu mẹo nhớ cho "${book.units[unitIndex].words[wordIndex].zh}"!`,
  )
}

async function hskSaveAdminData(book: any): Promise<void> {
  if (auth.currentUser?.email !== 'hoang1886@gmail.com') {
    toast('⛔ Chỉ admin mới có quyền lưu dữ liệu này!')
    return
  }
  try {
    const tips: Record<string, string> = {}
    book.units.forEach((unit: any) => {
      unit.words.forEach((w: any) => {
        if (w.memoryTip) tips[w.zh] = w.memoryTip
      })
    })
    const tipsDocRef = doc(firestore, 'hsk_tips', book.id)
    await setDoc(tipsDocRef, { tips }, { merge: false })
    toast('☁️ Đã đồng bộ mẹo nhớ lên Firebase!')
  } catch (e: any) {
    console.warn('HSK admin save error:', e)
    toast('⚠️ Firebase sync thất bại: ' + (e.message || e))
  }
}

const _hskTipsLoaded = new Set<string>()

async function hskLoadTipsFromFirestore(bookId: string): Promise<void> {
  if (_hskTipsLoaded.has(bookId)) return
  _hskTipsLoaded.add(bookId)
  try {
    const tipsDocRef = doc(firestore, 'hsk_tips', bookId)
    const snap = await getDoc(tipsDocRef)
    if (!snap.exists()) return
    const { tips } = snap.data() as { tips: Record<string, string> }
    if (!tips) return
    const book = hskGetBook(bookId)
    if (!book) return
    book.units.forEach(unit => {
      unit.words.forEach(w => {
        if (tips[w.zh] !== undefined) w.memoryTip = tips[w.zh]
      })
    })
  } catch (e) {
    console.warn('hskLoadTipsFromFirestore error:', e)
  }
}

// ── Add word to SRS dict — opens modal for wordType + extra fields ─────────────
function hskAddWordToDict(hskWord: any): void {
  if (hskIsMemorized(hskWord.zh)) {
    toast('🎓 Từ này đã thuộc lòng rồi, không cần thêm vào SRS!')
    return
  }
  if (hskIsInDict(hskWord.zh)) {
    toast('Từ này đã có trong từ điển rồi!')
    return
  }
  const zhEl = $('hsk-modal-zh')
  const pyEl = $('hsk-modal-py')
  const viValEl = $('hsk-modal-vi-val')
  if (zhEl) zhEl.textContent = hskWord.zh
  if (pyEl) pyEl.textContent = getPinyin(hskWord.zh)
  if (viValEl) viValEl.textContent = hskWord.vi
  const zhdefInp = $('hsk-modal-zhdef-inp') as HTMLInputElement | null
  const exzhInp = $('hsk-modal-exzh-inp') as HTMLInputElement | null
  const exviInp = $('hsk-modal-exvi-inp') as HTMLInputElement | null
  const noteInp = $('hsk-modal-note-inp') as HTMLInputElement | null
  if (zhdefInp) zhdefInp.value = hskWord.zhDef || ''
  if (exzhInp) exzhInp.value = hskWord.exZh || ''
  if (exviInp) exviInp.value = hskWord.exVi || ''
  if (noteInp) noteInp.value = hskWord.memoryTip || ''

  _hskModalWord = hskWord
  _hskModalSelectedType = ''
  buildWordTypeSelector(
    'hsk-modal-wtype',
    () => _hskModalSelectedType,
    (v: string) => { _hskModalSelectedType = v },
  )
  const overlay = $('hsk-add-modal-overlay')
  if (overlay) overlay.style.display = 'flex'
}

function hskConfirmAddWord(): void {
  const hskWord = _hskModalWord
  if (!hskWord) return
  const book = hskGetBook(hskState.bookId)
  const newWord = {
    id: Date.now() + Math.random(),
    zh: hskWord.zh,
    vi: hskWord.vi,
    pinyin: getPinyin(hskWord.zh),
    zhDef:
      ($('hsk-modal-zhdef-inp') as HTMLInputElement | null)?.value.trim() ||
      hskWord.zhDef ||
      '',
    exZh:
      ($('hsk-modal-exzh-inp') as HTMLInputElement | null)?.value.trim() ||
      hskWord.exZh ||
      '',
    exVi:
      ($('hsk-modal-exvi-inp') as HTMLInputElement | null)?.value.trim() ||
      hskWord.exVi ||
      '',
    note:
      ($('hsk-modal-note-inp') as HTMLInputElement | null)?.value.trim() ||
      hskWord.memoryTip ||
      '',
    wordType: _hskModalSelectedType || '',
    wordTypes: _hskModalSelectedType ? [_hskModalSelectedType] : [],
    source: `${book?.id || 'hsk'}-unit${(hskState.unitIndex ?? 0) + 1}`,
    status: 'new' as const,
    ef: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: null,
    lastReview: null,
    added: Date.now(),
  }
  db.words.push(newWord as any)
  save()
  const overlay = $('hsk-add-modal-overlay')
  if (overlay) overlay.style.display = 'none'
  toast(`✓ Đã thêm "${hskWord.zh}" vào từ điển!`)
  hskRenderWordReader()
}

export function initHskAddModal(): void {
  $('hsk-modal-confirm-btn')?.addEventListener('click', hskConfirmAddWord)
  $('hsk-modal-cancel-btn')?.addEventListener('click', () => {
    const overlay = $('hsk-add-modal-overlay')
    if (overlay) overlay.style.display = 'none'
  })
  $('hsk-add-modal-overlay')?.addEventListener('click', e => {
    const overlay = $('hsk-add-modal-overlay')
    if (e.target === overlay && overlay) overlay.style.display = 'none'
  })
}

function hskMarkMemorized(hskWord: any): void {
  if (!db.memorized) (db as any).memorized = []
  if (!((db.memorized as any[]).includes(hskWord.zh))) {
    ;(db.memorized as any[]).push(hskWord.zh)
  }
  save()
  toast('✓ Đã đánh dấu thuộc lòng!')
  hskRenderWordReader()
}

// ── Init HSK nav ──────────────────────────────────────────────────────────────
export function initHskNav(): void {
  const navEl = $('nav-hsk-books')
  if (navEl) navEl.addEventListener('click', () => nav('hsk-books'))
}

// ── Quick-Learn (randomized, no Firebase) ─────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const _ql = {
  words: [] as Array<{ zh: string; vi: string; pinyin: string }>,
  idx: 0,
  known: 0,
  unknown: 0,
  flipped: false,
}

function hskOpenQuickLearn(): void {
  const book = hskGetBook(hskState.bookId)
  if (!book || book.units.length === 0) {
    toast('⚠️ Chưa có dữ liệu để học!')
    return
  }
  const all = book.units.flatMap(u => u.words)
  _ql.words = shuffle(all.map(w => ({ zh: w.zh, vi: w.vi, pinyin: getPinyin(w.zh) })))
  _ql.idx = 0; _ql.known = 0; _ql.unknown = 0; _ql.flipped = false

  const titleEl = $('hsk-ql-title')
  if (titleEl) titleEl.textContent = `🎲 ${book.title} — học ngẫu nhiên (${all.length} từ)`

  const overlay = $('hsk-ql-overlay')
  if (overlay) overlay.style.display = 'flex'

  hskRenderQlCard()

  const closeBtn = $('hsk-ql-close')
  if (closeBtn) (closeBtn as HTMLButtonElement).onclick = () => {
    const o = $('hsk-ql-overlay'); if (o) o.style.display = 'none'
  }
  const overlayEl = $('hsk-ql-overlay')
  if (overlayEl) overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) overlayEl.style.display = 'none'
  }, { once: true })
}

function hskRenderQlCard(): void {
  const { words, idx, known, unknown, flipped } = _ql
  const total = words.length

  const counter = $('hsk-ql-counter')
  if (counter) counter.textContent = `${Math.min(idx + 1, total)} / ${total}`
  const fill = $('hsk-ql-progress-fill') as HTMLElement | null
  if (fill) fill.style.width = `${(idx / total) * 100}%`
  const stats = $('hsk-ql-stats')
  if (stats) stats.innerHTML = `<span style="color:#22c55e;font-weight:700">✓ ${known}</span>&nbsp;·&nbsp;<span style="color:var(--red);font-weight:700">✗ ${unknown}</span>`

  const ctrl = $('hsk-ql-controls')

  if (idx >= total) {
    const area = $('hsk-ql-card-area')
    if (area) area.innerHTML = `
      <div style="text-align:center;padding:20px">
        <div style="font-size:52px;margin-bottom:14px">🎉</div>
        <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:6px">Hoàn thành!</div>
        <div style="font-size:14px;color:var(--text2)">Biết: <b style="color:#22c55e">${known}</b> · Chưa biết: <b style="color:var(--red)">${unknown}</b> / ${total} từ</div>
        <button id="hsk-ql-restart" style="margin-top:22px;padding:12px 28px;background:linear-gradient(135deg,var(--red),var(--red-dark));color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;box-shadow:0 3px 10px var(--red-glow)">🔄 Học lại</button>
      </div>`
    if (ctrl) ctrl.style.display = 'none'
    $('hsk-ql-restart')?.addEventListener('click', () => {
      _ql.words = shuffle([..._ql.words])
      _ql.idx = 0; _ql.known = 0; _ql.unknown = 0; _ql.flipped = false
      if (ctrl) ctrl.style.display = ''
      hskRenderQlCard()
    })
    return
  }

  const word = words[idx]
  const area = $('hsk-ql-card-area')
  if (area) area.innerHTML = flipped
    ? `<div style="text-align:center;width:100%">
        <div class="hsk-ql-zh">${word.zh}</div>
        <div class="hsk-ql-py">${word.pinyin}</div>
        <div class="hsk-ql-vi">${word.vi}</div>
       </div>`
    : `<div style="text-align:center;width:100%">
        <div class="hsk-ql-zh">${word.zh}</div>
        <div class="hsk-ql-py">${word.pinyin}</div>
       </div>`

  const flipBtn = $('hsk-ql-flip')
  const answerDiv = $('hsk-ql-answer') as HTMLElement | null
  const knowBtn = $('hsk-ql-know')
  const unknownBtn = $('hsk-ql-unknown')

  if (ctrl) ctrl.style.display = ''
  if (flipBtn) {
    (flipBtn as HTMLElement).style.display = flipped ? 'none' : ''
    ;(flipBtn as HTMLButtonElement).onclick = () => { _ql.flipped = true; hskRenderQlCard() }
  }
  if (answerDiv) answerDiv.style.display = flipped ? 'flex' : 'none'
  if (knowBtn) (knowBtn as HTMLButtonElement).onclick = () => {
    _ql.known++; _ql.idx++; _ql.flipped = false; hskRenderQlCard()
  }
  if (unknownBtn) (unknownBtn as HTMLButtonElement).onclick = () => {
    _ql.unknown++; _ql.idx++; _ql.flipped = false; hskRenderQlCard()
  }
}
