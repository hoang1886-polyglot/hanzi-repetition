// ═══════════════════════════════════════════════════════════════════════════════
// TEXTBOOKS MODULE  (Sách giáo khoa)
// ═══════════════════════════════════════════════════════════════════════════════

import { firestore, auth } from '../firebase'
import {
  doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc,
  query, where, orderBy, deleteDoc,
} from 'firebase/firestore'
import { db, tbState } from '../state'
import { $, toast, getPinyin, applyRubyAnnotations } from '../utils'
import { isTraditional, _openccConverter } from '../state'
import { save } from '../sync'
import { nav } from '../router'
import { addWordFromArticle } from './wordlist'
import { analyzeGrammar } from './grammar'
import { setupTextSelection, applyWordHighlight, applyFreeHighlight } from './highlight'

// ── Module-level state ─────────────────────────────────────────────────────────
let _tbArticleEditId: string | null = null
let _tbBookEditId: string | null = null
let _tbPractice: any = {
  queue: [], card: null, answered: false, correct: 0, total: 0, initial: 0,
  container: 'tb-art-practice', restartFn: null,
}
let _tbBlocks: any[] = []
let _tbLastFocusedEditor: HTMLElement | null = null

// ── Level metadata ─────────────────────────────────────────────────────────────
export const TB_LEVELS = [
  { level: 1, label: 'HSK 1', sub: 'Sơ cấp',       grad: 'linear-gradient(135deg,#F6A623,#E8910E)' },
  { level: 2, label: 'HSK 2', sub: 'Sơ–trung cấp', grad: 'linear-gradient(135deg,#F97316,#C2410C)' },
  { level: 3, label: 'HSK 3', sub: 'Trung cấp',     grad: 'linear-gradient(135deg,#22C55E,#15803D)' },
  { level: 4, label: 'HSK 4', sub: 'Trung–cao cấp', grad: 'linear-gradient(135deg,#3B82F6,#1D4ED8)' },
  { level: 5, label: 'HSK 5', sub: 'Cao cấp',       grad: 'linear-gradient(135deg,#A855F7,#7C3AED)' },
  { level: 6, label: 'HSK 6', sub: 'Thành thạo',    grad: 'linear-gradient(135deg,#EF4444,#991B1B)' },
]

// ── Navigate ───────────────────────────────────────────────────────────────────
export async function tbNav(
  view: string,
  level: number | null = null,
  bookId: string | null = null,
  articleId: string | null = null,
): Promise<void> {
  tbState.view      = view
  tbState.level     = level
  tbState.bookId    = bookId
  tbState.articleId = articleId
  if (view !== 'words' && view !== 'article') tbState.bookData = null
  if (view !== 'article') tbState.articleData = null

  ;['tb-view-levels', 'tb-view-books', 'tb-view-words', 'tb-view-article'].forEach(id => {
    const el = $(id); if (el) el.style.display = 'none'
  })
  const viewEl = $(`tb-view-${view}`)
  if (viewEl) viewEl.style.display = ''
  tbRenderBreadcrumb()

  if (view === 'levels')  tbRenderLevels()
  if (view === 'books')   await tbRenderBooks()
  if (view === 'words')   await tbRenderWords()
  if (view === 'article') await tbRenderArticle()
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────────
function tbRenderBreadcrumb(): void {
  const el = $('tb-breadcrumb')
  if (!el) return
  const { view, level, bookData, articleData } = tbState
  if (view === 'levels') { el.style.display = 'none'; return }
  el.style.display = 'flex'
  const lvl = TB_LEVELS.find(l => l.level === level)
  const parts: Array<{ label: string; onclick: (() => void) | null; isCurrent?: boolean }> = [
    { label: '📖 Sách giáo khoa', onclick: () => tbNav('levels') },
  ]
  if (lvl) {
    const isLvlCurrent = view === 'books'
    parts.push({ label: lvl.label, onclick: () => tbNav('books', level), isCurrent: isLvlCurrent })
  }
  if ((view === 'words' || view === 'article') && bookData) {
    const isBookCurrent = view === 'words'
    const bookOnClick = view === 'article'
      ? () => { tbState.bookTab = 'articles'; tbNav('words', level, tbState.bookId) }
      : null
    parts.push({ label: bookData.title, onclick: bookOnClick, isCurrent: isBookCurrent })
  }
  if (view === 'article' && articleData) {
    parts.push({ label: articleData.title, onclick: null, isCurrent: true })
  }
  el.innerHTML = parts.map((p, i) => {
    const sep = i > 0 ? `<span class="hsk-breadcrumb-sep">›</span>` : ''
    if (p.isCurrent) return `${sep}<span class="hsk-breadcrumb-current">${p.label}</span>`
    return `${sep}<span class="hsk-breadcrumb-item" data-bc="${i}">${p.label}</span>`
  }).join('')
  el.querySelectorAll('[data-bc]').forEach(btn => {
    const i = parseInt((btn as HTMLElement).dataset.bc!)
    btn.addEventListener('click', parts[i].onclick!)
  })
}

// ── Level grid ─────────────────────────────────────────────────────────────────
function tbRenderLevels(): void {
  const grid = $('tb-levels-grid')
  if (!grid) return
  grid.innerHTML = TB_LEVELS.map(l => `
    <div class="tb-level-card" data-level="${l.level}" style="background:${l.grad}">
      <div class="tb-level-pill">HSK ${l.level}</div>
      <div class="tb-level-sub">Sách giáo khoa</div>
      <div class="tb-level-name">${l.label}</div>
      <div class="tb-level-sublabel">${l.sub}</div>
    </div>`).join('')
  grid.querySelectorAll('[data-level]').forEach(card => {
    card.addEventListener('click', () => tbNav('books', parseInt((card as HTMLElement).dataset.level!)))
  })
}

// ── Book list ──────────────────────────────────────────────────────────────────
async function tbRenderBooks(): Promise<void> {
  const list = $('tb-books-list')
  if (!list) return
  const lvl = TB_LEVELS.find(l => l.level === tbState.level)
  const lvlTitleEl = $('tb-level-title')
  if (lvl && lvlTitleEl) lvlTitleEl.textContent = lvl.label
  list.innerHTML = `<div class="hsk-loading"><div class="spinner"></div><p>Đang tải sách...</p></div>`
  try {
    const q = query(
      collection(firestore, 'textbooks'),
      where('level', '==', tbState.level),
      orderBy('order'),
    )
    const snap = await getDocs(q)
    const books: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    tbState.booksCache[tbState.level!] = books
    const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')
    list.innerHTML = ''

    if (books.length === 0) {
      list.innerHTML = `<p style="color:var(--text3);font-size:14px;padding:16px 0;grid-column:1/-1">${isAdmin ? 'Chưa có sách nào. Nhấn "+ Thêm sách" để bắt đầu.' : 'Chưa có sách nào cho cấp độ này.'}</p>`
    } else {
      const typeLabel: Record<string, string> = { jiaocheng: 'Giáo trình', exam: 'Đề thi', other: 'Khác' }
      list.innerHTML = books.map(b => {
        const wordCount = b.wordCount ?? (b.words || []).length
        const grad = lvl?.grad || 'var(--red)'
        return `
        <div class="tb-book-card" data-bookid="${b.id}">
          <div class="tb-book-cover">
            ${b.imageUrl ? `<img src="${b.imageUrl}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
            <div class="tb-book-cover-ph" style="background:${grad};display:${b.imageUrl ? 'none' : 'flex'}">${b.title.slice(0, 4)}</div>
          </div>
          <div class="tb-book-info">
            <div class="tb-book-title">${b.title}</div>
            ${b.subtitle ? `<div class="tb-book-subtitle">${b.subtitle}</div>` : ''}
            <div class="tb-book-meta">
              <span>${wordCount} từ</span>
              ${b.type ? `<span class="tb-book-type-tag">${typeLabel[b.type] || b.type}</span>` : ''}
            </div>
          </div>
        </div>`
      }).join('')
      list.querySelectorAll('[data-bookid]').forEach(card => {
        card.addEventListener('click', () => tbNav('words', tbState.level, (card as HTMLElement).dataset.bookid!))
      })

      // Background-sync word counts for books that haven't been synced yet
      books.filter(b => b.wordCount == null).forEach(async (b) => {
        const count = await tbSyncWordCount(b.id)
        const span = list.querySelector(`[data-bookid="${b.id}"] .tb-book-meta span`)
        if (span) span.textContent = `${count} từ`
      })
    }
    if (isAdmin) {
      const btn = document.createElement('button')
      btn.className = 'submit-btn'
      btn.style.cssText = 'margin-top:4px;padding:10px 22px;font-size:13px;grid-column:1/-1;justify-self:start'
      btn.textContent = '+ Thêm sách mới'
      btn.addEventListener('click', () => tbShowAddBookModal(tbState.level!))
      list.appendChild(btn)
    }
  } catch (e: any) {
    console.error(e)
    list.innerHTML = `<p style="color:var(--red);font-size:14px">Lỗi tải sách: ${e.message}</p>`
  }
}

// ── Book view (words + articles tabs) ─────────────────────────────────────────
async function tbRenderWords(): Promise<void> {
  const container = $('tb-words-container')
  if (!container) return
  container.innerHTML = `<div class="hsk-loading"><div class="spinner"></div><p>Đang tải...</p></div>`
  try {
    const snap = await getDoc(doc(firestore, 'textbooks', tbState.bookId!))
    if (!snap.exists()) { container.innerHTML = '<p>Không tìm thấy sách.</p>'; return }
    const book: any = { id: snap.id, ...snap.data() }
    tbState.bookData = book
    tbRenderBreadcrumb()

    const titleHeader = $('tb-book-title-header')
    const subtitleHeader = $('tb-book-subtitle-header')
    if (titleHeader)    titleHeader.textContent   = book.title
    if (subtitleHeader) subtitleHeader.textContent = book.subtitle || ''

    const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')
    let bookEditBtn = $('tb-book-edit-inline-btn') as HTMLButtonElement | null
    if (!bookEditBtn) {
      bookEditBtn = document.createElement('button')
      bookEditBtn.id = 'tb-book-edit-inline-btn'
      bookEditBtn.style.cssText = 'margin-top:8px;padding:7px 16px;background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);font-family:"DM Sans",sans-serif'
      bookEditBtn.textContent = '✎ Sửa thông tin sách'
      $('tb-view-words')?.querySelector('.page-header')?.appendChild(bookEditBtn)
    }
    bookEditBtn.style.display = isAdmin ? '' : 'none'
    bookEditBtn.onclick = () => tbShowEditBookModal(book)

    container.innerHTML = `
      <div style="display:flex;gap:0;margin-bottom:18px;border-bottom:2px solid var(--border)">
        <button class="tb-tab-btn" data-tab="articles" style="padding:10px 22px;font-size:14px;font-weight:600;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-2px;font-family:'DM Sans',sans-serif;transition:color 0.15s">Bài đọc</button>
        <button class="tb-tab-btn" data-tab="words"    style="padding:10px 22px;font-size:14px;font-weight:600;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-2px;font-family:'DM Sans',sans-serif;transition:color 0.15s">Từ vựng</button>
        <button class="tb-tab-btn" data-tab="practice" style="padding:10px 22px;font-size:14px;font-weight:600;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-2px;font-family:'DM Sans',sans-serif;transition:color 0.15s">⚡ Ôn tập</button>
      </div>
      <div id="tb-tab-content"></div>`

    function updateTabStyle() {
      container.querySelectorAll('.tb-tab-btn').forEach(b => {
        const active = (b as HTMLElement).dataset.tab === tbState.bookTab
        ;(b as HTMLElement).style.borderBottomColor = active ? 'var(--red)' : 'transparent'
        ;(b as HTMLElement).style.color = active ? 'var(--red)' : 'var(--text2)'
      })
    }
    updateTabStyle()

    container.querySelectorAll('.tb-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        tbState.bookTab = (btn as HTMLElement).dataset.tab!
        updateTabStyle()
        await tbRenderBookTabContent(book)
      })
    })

    await tbRenderBookTabContent(book)
  } catch (e: any) {
    console.error(e)
    container.innerHTML = `<p style="color:var(--red);font-size:14px">Lỗi: ${e.message}</p>`
  }
}

async function tbRenderBookTabContent(book: any): Promise<void> {
  const content = $('tb-tab-content')
  if (!content) return
  if (tbState.bookTab === 'words')        await tbRenderWordsList(book, content)
  else if (tbState.bookTab === 'practice') await tbRenderBookPractice(book, content)
  else                                     await tbRenderArticlesList(book, content)
}

async function tbRenderBookPractice(book: any, container: HTMLElement): Promise<void> {
  container.innerHTML = `<div class="hsk-loading"><div class="spinner"></div><p>Đang tải từ vựng...</p></div>`

  // Aggregate words from all articles (same logic as words tab)
  const allWords: any[] = [...(book.words || [])]
  try {
    const artSnap = await getDocs(query(collection(firestore, 'textbooks', book.id, 'articles'), orderBy('order')))
    artSnap.docs.forEach(d => {
      ;(d.data().words || []).forEach((w: any) => {
        if (w.zh && !allWords.some((aw: any) => aw.zh === w.zh)) allWords.push(w)
      })
    })
  } catch { /* ignore */ }

  container.innerHTML = `
    <div style="max-width:560px;margin:0 auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">${book.title} — Ôn tập từ vựng</div>
          <div style="font-size:13px;color:var(--text3);margin-top:3px">${allWords.length} từ · không lưu vào dữ liệu chính</div>
        </div>
        <button id="tb-book-prac-start-btn" class="submit-btn" style="padding:10px 22px;font-size:13px"
          ${allWords.length === 0 ? 'disabled style="opacity:.5"' : ''}>
          ▶ Bắt đầu
        </button>
      </div>
      ${allWords.length === 0
        ? `<div class="card" style="text-align:center;padding:32px;color:var(--text3);font-size:14px">
             Sách này chưa có từ vựng.<br>Hãy thêm bài đọc và import từ vựng trước nhé!
           </div>`
        : `<div class="card" style="padding:0;overflow:hidden">
             <table style="width:100%;font-size:13px;border-collapse:collapse">
               <thead>
                 <tr style="background:var(--surface2)">
                   <th style="padding:10px 16px;text-align:left;color:var(--text3);font-weight:500;font-size:11px;text-transform:uppercase">Chữ Hán</th>
                   <th style="padding:10px 8px;text-align:left;color:var(--text3);font-weight:500;font-size:11px;text-transform:uppercase">Nghĩa</th>
                 </tr>
               </thead>
               <tbody>
                 ${allWords.slice(0, 8).map((w: any) => `
                   <tr style="border-top:1px solid var(--border)">
                     <td style="padding:9px 16px;font-family:'Noto Serif SC',serif;font-size:16px;font-weight:600">${w.zh}</td>
                     <td style="padding:9px 8px;color:var(--text2);font-size:13px">${w.vi || ''}</td>
                   </tr>`).join('')}
                 ${allWords.length > 8 ? `
                   <tr style="border-top:1px solid var(--border);background:var(--surface2)">
                     <td colspan="2" style="padding:10px 16px;color:var(--text3);font-size:12px;text-align:center">
                       ... và ${allWords.length - 8} từ khác
                     </td>
                   </tr>` : ''}
               </tbody>
             </table>
           </div>`}
      <div id="tb-book-practice" style="margin-top:18px"></div>
    </div>`

  $('tb-book-prac-start-btn')?.addEventListener('click', () => {
    const startBtn = $('tb-book-prac-start-btn')
    if (startBtn) startBtn.style.display = 'none'
    tbStartPractice(allWords, 'tb-book-practice')
  })
}

async function tbRenderWordsList(book: any, container: HTMLElement): Promise<void> {
  const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')
  container.innerHTML = `<div class="hsk-loading"><div class="spinner"></div><p>Đang tải từ vựng...</p></div>`

  // Aggregate words from book-level list + all article vocabulary
  const allWords: any[] = [...(book.words || [])]
  try {
    const artSnap = await getDocs(query(collection(firestore, 'textbooks', book.id, 'articles'), orderBy('order')))
    artSnap.docs.forEach(d => {
      ;(d.data().words || []).forEach((w: any) => {
        if (w.zh && !allWords.some((aw: any) => aw.zh === w.zh)) allWords.push(w)
      })
    })
  } catch { /* ignore */ }

  const notAdded = allWords.filter(w => !db.words.some(dw => dw.zh === w.zh))
  let html = `<div class="card" style="max-width:820px">`
  if (notAdded.length > 0 || isAdmin) {
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">`
    if (notAdded.length > 0) {
      html += `<button class="submit-btn" id="tb-add-all-btn" style="padding:8px 18px;font-size:13px;background:var(--green);border-color:var(--green)">📚 Thêm tất cả ${notAdded.length} từ vào SRS</button>`
    } else {
      html += `<span style="font-size:13px;color:var(--green);font-weight:600">✓ Tất cả từ đã được thêm vào SRS</span>`
    }
    if (isAdmin) {
      html += `<button class="submit-btn" id="tb-add-word-btn" style="padding:8px 18px;font-size:13px">+ Thêm từ mới</button>`
    }
    html += `</div>`
  }
  if (allWords.length === 0) {
    html += `<p style="color:var(--text3);font-size:14px">Chưa có từ vựng nào.</p>`
  } else {
    html += `<table><thead><tr><th>Chữ Hán</th><th>Pinyin</th><th>Từ loại</th><th>Nghĩa tiếng Việt</th><th>Ví dụ</th><th></th></tr></thead><tbody>`
    allWords.forEach((w: any, i: number) => {
      const py = getPinyin(w.zh)
      const inDict = db.words.some(dw => dw.zh === w.zh)
      html += `<tr>
        <td style="font-family:'Noto Serif SC',serif;font-size:18px;font-weight:600">${w.zh}</td>
        <td style="font-size:13px;color:var(--red);font-weight:500">${py}</td>
        <td style="font-size:12px">${w.pos ? `<span style="font-weight:700;color:var(--text3);background:var(--surface2);border:1px solid var(--border2);border-radius:4px;padding:1px 7px;letter-spacing:.4px">${w.pos}</span>` : ''}</td>
        <td style="font-size:13px;color:var(--text2)">${w.vi || ''}</td>
        <td style="font-size:12px;color:var(--text3);max-width:200px">${w.exZh ? `<span style="font-family:'Noto Sans SC',sans-serif">${w.exZh}</span>` : ''}</td>
        <td>
          <button class="tb-add-dict-btn${inDict ? ' added' : ''}" data-i="${i}"
            style="padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;
              border:1.5px solid ${inDict ? 'var(--green)' : 'var(--red)'};
              background:${inDict ? 'var(--green-light)' : 'transparent'};
              color:${inDict ? 'var(--green)' : 'var(--red)'};font-family:'DM Sans',sans-serif"
            ${inDict ? 'disabled' : ''}>
            ${inDict ? '✓ Đã thêm' : '+ Thêm'}
          </button>
        </td>
      </tr>`
    })
    html += `</tbody></table>`
  }
  html += `</div>`
  container.innerHTML = html

  container.querySelectorAll('.tb-add-dict-btn:not(.added)').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = allWords[parseInt((btn as HTMLElement).dataset.i!)]
      addWordFromTextbook(w.zh, w.vi || '', w.exZh || '', w.exVi || '', w.note || '')
      ;(btn as HTMLElement).textContent = '✓ Đã thêm'
      btn.classList.add('added')
      ;(btn as HTMLElement).style.borderColor = 'var(--green)'
      ;(btn as HTMLElement).style.background  = 'var(--green-light)'
      ;(btn as HTMLElement).style.color       = 'var(--green)'
      ;(btn as HTMLButtonElement).disabled = true
    })
  })

  $('tb-add-all-btn')?.addEventListener('click', () => {
    const addAllBtn = $('tb-add-all-btn') as HTMLButtonElement
    addAllBtn.disabled = true
    addAllBtn.textContent = '⏳ Đang thêm...'
    let count = 0
    notAdded.forEach((w: any) => {
      addWordFromTextbook(w.zh, w.vi || '', w.exZh || '', w.exVi || '', w.note || '')
      count++
    })
    container.querySelectorAll('.tb-add-dict-btn:not(.added)').forEach(rowBtn => {
      ;(rowBtn as HTMLElement).textContent = '✓ Đã thêm'
      rowBtn.classList.add('added')
      ;(rowBtn as HTMLElement).style.borderColor = 'var(--green)'
      ;(rowBtn as HTMLElement).style.background  = 'var(--green-light)'
      ;(rowBtn as HTMLElement).style.color       = 'var(--green)'
      ;(rowBtn as HTMLButtonElement).disabled = true
    })
    addAllBtn.textContent = `✓ Đã thêm ${count} từ`
    addAllBtn.style.background  = 'linear-gradient(135deg,#177A47,#0F5C33)'
    addAllBtn.style.color       = '#fff'
    addAllBtn.style.borderColor = 'transparent'
    addAllBtn.style.boxShadow   = '0 2px 8px rgba(23,122,71,0.35)'
    toast(`Đã thêm ${count} từ vào SRS!`)
  })

  if (isAdmin) {
    $('tb-add-word-btn')?.addEventListener('click', () => tbShowAddWordModal(book))
  }
}

async function tbRenderArticlesList(book: any, container: HTMLElement): Promise<void> {
  const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')
  container.innerHTML = `<div class="hsk-loading"><div class="spinner"></div><p>Đang tải bài đọc...</p></div>`
  try {
    const q = query(collection(firestore, 'textbooks', book.id, 'articles'), orderBy('order'))
    const snap = await getDocs(q)
    const articles: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    const lvl = TB_LEVELS.find(l => l.level === tbState.level)

    if (articles.length === 0) {
      container.innerHTML = `<p style="color:var(--text3);font-size:14px;padding:16px 0">${isAdmin ? 'Chưa có bài đọc nào. Nhấn "+ Thêm bài đọc" để bắt đầu.' : 'Chưa có bài đọc nào.'}</p>`
    } else {
      container.innerHTML = `<div style="max-width:640px">` + articles.map(a => `
        <div class="tb-art-list-card" data-artid="${a.id}">
          <div class="tb-art-list-bar" style="background:${lvl?.grad || 'var(--red)'}"></div>
          <div class="tb-art-list-content">
            <div class="tb-art-list-title">${a.title}</div>
            ${a.source ? `<div class="tb-art-list-sub">${a.source}</div>` : ''}
            <div class="tb-art-list-meta">${(a.words || []).length} từ vựng</div>
          </div>
          <div class="tb-art-list-arrow">›</div>
        </div>`).join('') + `</div>`
      container.querySelectorAll('[data-artid]').forEach(card => {
        card.addEventListener('click', () => tbNav('article', tbState.level, tbState.bookId, (card as HTMLElement).dataset.artid!))
      })
    }

    if (isAdmin) {
      const btn = document.createElement('button')
      btn.className = 'submit-btn'
      btn.style.cssText = 'margin-top:14px;padding:10px 22px;font-size:13px'
      btn.textContent = '+ Thêm bài đọc mới'
      btn.addEventListener('click', () => tbShowAddArticleModal(book))
      container.appendChild(btn)
    }
  } catch (e: any) {
    console.error(e)
    container.innerHTML = `<p style="color:var(--red);font-size:14px">Lỗi: ${e.message}</p>`
  }
}

// ── Article reader ─────────────────────────────────────────────────────────────
async function tbRenderArticle(): Promise<void> {
  const bodyEl   = $('tb-art-reader-body')
  const vocabEl  = $('tb-art-vocab')
  const titleEl  = $('tb-art-title')
  const sourceEl = $('tb-art-source')
  if (!bodyEl) return

  if (titleEl)  titleEl.textContent  = ''
  if (sourceEl) sourceEl.textContent = ''
  bodyEl.innerHTML = ''
  if (vocabEl) vocabEl.innerHTML = '<div class="hsk-loading"><div class="spinner"></div></div>'

  tbState.tbPinyinMode = false
  const ptb = $('tb-art-pinyin-btn')
  if (ptb) { ptb.classList.remove('active'); ptb.onclick = null }

  const backBtn = $('tb-art-back-btn')
  if (backBtn) backBtn.onclick = () => { tbState.bookTab = 'articles'; tbNav('words', tbState.level, tbState.bookId) }

  try {
    const snap = await getDoc(doc(firestore, 'textbooks', tbState.bookId!, 'articles', tbState.articleId!))
    if (!snap.exists()) { bodyEl.innerHTML = '<p>Không tìm thấy bài đọc.</p>'; return }
    const article: any = { id: snap.id, ...snap.data() }
    tbState.articleData = article
    tbRenderBreadcrumb()

    if (titleEl)  titleEl.textContent  = article.title  || ''
    if (sourceEl) sourceEl.textContent = article.source || ''

    const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')
    let artEditBtn = $('tb-art-edit-btn')
    if (!artEditBtn) {
      artEditBtn = document.createElement('button')
      artEditBtn.id = 'tb-art-edit-btn'
      artEditBtn.style.cssText = 'background:var(--surface);border:1.5px solid var(--border2);border-radius:var(--radius-sm);padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);font-family:"DM Sans",sans-serif;transition:all 0.15s'
      artEditBtn.textContent = '✎ Sửa bài'
      $('tb-view-article')?.querySelector('.page-header > div')?.appendChild(artEditBtn)
    }
    artEditBtn.style.display = isAdmin ? '' : 'none'
    ;(artEditBtn as HTMLElement).onclick = () => tbShowEditArticleModal(article)

    tbRenderTbArticleBody(article)

    if (ptb) {
      ptb.onclick = () => {
        tbState.tbPinyinMode = !tbState.tbPinyinMode
        ptb.classList.toggle('active', tbState.tbPinyinMode)
        tbRenderTbArticleBody(article)
      }
    }

    if (vocabEl) tbRenderArticleVocabPanel(article.words || [])

    // Right panel tab switching
    document.querySelectorAll('.tb-rt-tab').forEach(btn => {
      ;(btn as HTMLElement).onclick = () => {
        document.querySelectorAll('.tb-rt-tab').forEach(b => {
          const active = (b as HTMLElement).dataset.tab === (btn as HTMLElement).dataset.tab
          ;(b as HTMLElement).style.borderBottomColor = active ? 'var(--red)' : 'transparent'
          ;(b as HTMLElement).style.color = active ? 'var(--red)' : 'var(--text2)'
          b.classList.toggle('active', active)
        })
        const isVocab = (btn as HTMLElement).dataset.tab === 'vocab'
        if (vocabEl) vocabEl.style.display = isVocab ? '' : 'none'
        const practiceEl = $('tb-art-practice')
        if (practiceEl) {
          practiceEl.style.display = isVocab ? 'none' : ''
          if (!isVocab) tbStartPractice(article.words || [])
        }
      }
    })

    setupTbArtTextSelection()
  } catch (e: any) {
    console.error(e)
    bodyEl.innerHTML = `<p style="color:var(--red);font-size:14px">Lỗi: ${e.message}</p>`
  }
}

/** Strip inline font-size, font-family and color from stored HTML so the
 *  reader typography panel (applyTypography) and dark-mode CSS can take effect. */
function tbSanitizeContent(html: string): string {
  return html.replace(/(<[^>]+?)\s+style="([^"]*)"/gi, (_m, tag, style) => {
    const kept = (style as string)
      .split(';')
      .map((s: string) => s.trim())
      .filter((s: string) => !/^\s*(font-size|font-family|color|background-color)\s*:/i.test(s))
      .filter(Boolean)
      .join('; ')
    return kept ? `${tag} style="${kept}"` : tag
  })
}

function tbRenderTbArticleBody(article: any): void {
  const bd = $('tb-art-reader-body')
  if (!bd) return
  // Support both old single-body and new multi-block articles
  const blocks = (article.blocks?.length)
    ? article.blocks
    : [{ type: 'text', content: article.body || '' }]

  bd.innerHTML = blocks.map((b: any) => {
    if (b.type === 'audio') {
      return `<div class="tb-audio-block">
        ${b.label ? `<div class="tb-audio-block-lbl">${b.label}</div>` : ''}
        <audio controls preload="metadata" src="${(b.url || '').replace(/"/g, '&quot;')}" style="width:100%"></audio>
      </div>`
    }
    // Sanitize stored HTML first so reader typography & dark-mode color cascade freely
    let html = tbSanitizeContent(b.content || '')
    if (isTraditional && _openccConverter) html = _openccConverter(html)
    ;(article.words || []).forEach((w: any) => { if (w.zh) html = applyWordHighlight(html, w.zh) })
    ;(article.freeHighlights || []).forEach((h: any) => { html = applyFreeHighlight(html, h) })
    return `<div class="tb-text-block">${html}</div>`
  }).join('')

  bd.classList.toggle('pinyin-on', tbState.tbPinyinMode)
  if (tbState.tbPinyinMode) applyRubyAnnotations(bd)
}

// ── Inline practice (SRS-style, no data side-effects) ─────────────────────────
function tbStartPractice(words: any[], containerId = 'tb-art-practice'): void {
  _tbPractice.container = containerId
  _tbPractice.restartFn = () => tbStartPractice(words, containerId)
  const el = $(containerId)
  if (!el) return
  if (!words.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text3);padding:12px 0">Chưa có từ vựng để luyện tập.<br>Hãy thêm / import từ trước nhé!</p>'
    return
  }
  _tbPractice.queue    = words.map(w => ({ ...w, ef: 2.5, interval: 0, repetitions: 0 })).sort(() => Math.random() - 0.5)
  _tbPractice.initial  = _tbPractice.queue.length
  _tbPractice.correct  = 0
  _tbPractice.total    = 0
  _tbPractice.answered = false
  _tbPractice.card     = null
  tbRenderPracticeCard()
}

function tbRenderPracticeCard(): void {
  const el = $(_tbPractice.container || 'tb-art-practice')
  if (!el) return

  if (!_tbPractice.queue.length) {
    const pct   = _tbPractice.total > 0 ? Math.round(_tbPractice.correct / _tbPractice.total * 100) : 0
    const grade = pct >= 90 ? '🏆 Xuất sắc!' : pct >= 70 ? '🎉 Tốt lắm!' : pct >= 50 ? '💪 Cố thêm nha!' : '📚 Ôn thêm nhé!'
    el.innerHTML = `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:36px;margin-bottom:10px">${pct >= 70 ? '🎉' : '📖'}</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:4px">${grade}</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:20px">Hoàn thành luyện tập</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:18px">
          <div style="background:var(--surface2);border-radius:8px;padding:12px 8px;border:1px solid var(--border)">
            <div style="font-size:22px;font-weight:700">${_tbPractice.initial}</div>
            <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase">Từ đã học</div>
          </div>
          <div style="background:var(--green-light);border-radius:8px;padding:12px 8px;border:1px solid var(--green-border)">
            <div style="font-size:22px;font-weight:700;color:var(--green)">${pct}%</div>
            <div style="font-size:10px;color:var(--green);font-weight:600;text-transform:uppercase">Chính xác</div>
          </div>
        </div>
        <button id="tb-prac-again-btn" class="submit-btn" style="width:100%;padding:10px">🔄 Luyện lại</button>
      </div>`
    $('tb-prac-again-btn')?.addEventListener('click', () => _tbPractice.restartFn?.())
    return
  }

  _tbPractice.card = _tbPractice.queue[0]
  const done = _tbPractice.initial - _tbPractice.queue.length
  const pct  = Math.max(0, done / _tbPractice.initial * 100)
  const w    = _tbPractice.card

  el.innerHTML = `
    <div class="review-progress" style="margin-bottom:6px"><div class="review-progress-fill" style="width:${pct}%"></div></div>
    <div style="font-size:11px;color:var(--text3);text-align:right;margin-bottom:12px">${done}/${_tbPractice.initial} · ${_tbPractice.correct} đúng</div>
    <div style="background:var(--surface2);border-radius:10px;padding:14px;border:1px solid var(--border);margin-bottom:12px">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.06em;color:var(--text3);margin-bottom:6px">NGHĨA TIẾNG VIỆT</div>
      <div style="font-size:16px;font-weight:700;color:var(--text);line-height:1.4;margin-bottom:${w.exZh ? '8px' : '0'}">${w.vi || ''}</div>
      ${w.exZh ? `<div style="font-size:11px;color:var(--text3);font-family:'Noto Sans SC',sans-serif;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">${w.exZh}</div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--red);font-weight:600;text-align:center;margin-bottom:6px;letter-spacing:0.03em" id="tb-prac-live-py"></div>
    <input id="tb-prac-input" type="text" placeholder="Nhập chữ Hán..."
      style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border2);border-radius:8px;
             font-size:15px;font-family:'Noto Sans SC',sans-serif;background:var(--surface);color:var(--text);
             outline:none;margin-bottom:8px">
    <div class="feedback-bar" id="tb-prac-fb" style="margin-bottom:6px"></div>
    <div id="tb-prac-ans" style="display:none;font-size:13px;color:var(--text2);margin-bottom:10px;text-align:center"></div>
    <button id="tb-prac-check-btn" class="check-btn" style="width:100%">Kiểm tra</button>
    <div id="tb-prac-diff" class="diff-btns" style="display:none;margin-top:8px">
      <button class="diff-btn again" data-grade="0"><span class="emoji">❌</span><span class="label">Lại</span><span class="interval" id="tpi0"></span></button>
      <button class="diff-btn hard"  data-grade="1"><span class="emoji">😐</span><span class="label">Khó</span><span class="interval" id="tpi1"></span></button>
      <button class="diff-btn good"  data-grade="2"><span class="emoji">🙂</span><span class="label">Được</span><span class="interval" id="tpi2"></span></button>
      <button class="diff-btn easy"  data-grade="3"><span class="emoji">😎</span><span class="label">Dễ</span><span class="interval" id="tpi3"></span></button>
    </div>`

  const inp = $('tb-prac-input') as HTMLInputElement | null
  inp?.focus()
  inp?.addEventListener('input', () => {
    const py = $('tb-prac-live-py')
    if (py) py.textContent = getPinyin(inp.value)
  })
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') tbCheckPracticeAnswer() })
  $('tb-prac-check-btn')?.addEventListener('click', tbCheckPracticeAnswer)
  el.querySelectorAll('.diff-btn').forEach(btn =>
    btn.addEventListener('click', () => tbGradePracticeCard(parseInt((btn as HTMLElement).dataset.grade!))))
  _tbPractice.answered = false
}

function tbCheckPracticeAnswer(): void {
  if (_tbPractice.answered) return
  const inp = $('tb-prac-input') as HTMLInputElement | null
  if (!inp?.value.trim()) return
  _tbPractice.answered = true
  _tbPractice.total++
  const ok = inp.value.trim() === _tbPractice.card.zh
  if (ok) _tbPractice.correct++
  const fb  = $('tb-prac-fb')
  const ans = $('tb-prac-ans')
  if (ok) {
    inp.classList.add('correct')
    if (fb) { fb.className = 'feedback-bar correct'; fb.textContent = '✓ Chính xác!' }
    if (ans) ans.style.display = 'none'
  } else {
    inp.classList.add('wrong')
    if (fb) { fb.className = 'feedback-bar wrong'; fb.textContent = '✗ Sai rồi!' }
    if (ans) {
      ans.style.display = 'block'
      ans.textContent = `Đáp án: ${_tbPractice.card.zh} (${getPinyin(_tbPractice.card.zh)})`
    }
  }
  const diffEl = $('tb-prac-diff')
  if (diffEl) diffEl.style.display = 'grid'
  const checkBtn = $('tb-prac-check-btn') as HTMLButtonElement | null
  if (checkBtn) { checkBtn.textContent = 'Chọn mức độ →'; checkBtn.disabled = true }
  for (let g = 0; g < 4; g++) {
    const intervalEl = $(`tpi${g}`)
    if (intervalEl) intervalEl.textContent = tbIntLabel(g, _tbPractice.card)
  }
}

function tbGradePracticeCard(g: number): void {
  tbSm2Local(_tbPractice.card, g)
  _tbPractice.queue.shift()
  if (g === 0 && _tbPractice.queue.length > 0) {
    const slot = Math.min(3, _tbPractice.queue.length)
    _tbPractice.queue.splice(slot, 0, { ..._tbPractice.card })
  }
  _tbPractice.answered = false
  tbRenderPracticeCard()
}

// Local SM-2 helpers (not persisted)
function tbSm2Local(w: any, g: number): void {
  let { ef = 2.5, interval = 0, repetitions = 0 } = w
  if (g === 0) { repetitions = 0; interval = 1 }
  else if (g === 1) { interval = Math.max(1, Math.round(interval * 1.2)); ef = Math.max(1.3, ef - 0.15) }
  else if (g === 2) {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 4 : Math.round(interval * ef)
    repetitions++
    ef = Math.max(1.3, ef - 0.08)
  } else {
    interval = repetitions === 0 ? 4 : Math.round(interval * ef * 1.3)
    repetitions++
    ef = Math.max(1.3, ef + 0.15)
  }
  w.ef = ef; w.interval = interval; w.repetitions = repetitions
  w._localNext = Date.now() + interval * 864e5
}

function tbIntLabel(g: number, w: any): string {
  const { ef = 2.5, interval = 0, repetitions = 0 } = w
  if (g === 0) return '<10 phút'
  if (g === 1) return `${Math.max(1, Math.round(interval * 1.2))} ngày`
  if (g === 2) return repetitions === 0 ? '1 ngày' : repetitions === 1 ? '4 ngày' : `${Math.round(interval * ef)} ngày`
  return repetitions === 0 ? '4 ngày' : `${Math.round(interval * ef * 1.3)} ngày`
}

function tbRenderArticleVocabPanel(words: any[]): void {
  const vocabEl = $('tb-art-vocab')
  if (!vocabEl) return
  const isAdmin = (auth.currentUser?.email === 'hoang1886@gmail.com')

  const adminBar = isAdmin ? `
    <div style="margin-bottom:14px">
      <button id="tb-import-vocab-btn"
        style="width:100%;padding:8px 0;background:var(--surface2);border:1.5px dashed var(--border2);border-radius:8px;
               font-size:12px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">
        📥 Import từ file (.csv / .json)
      </button>
      <input type="file" id="tb-import-vocab-file" accept=".csv,.json" style="display:none">
    </div>` : ''

  const wordsHtml = words.length === 0
    ? `<p style="font-size:13px;color:var(--text3)">Không có từ vựng.</p>`
    : words.map((w: any, i: number) => {
        const py     = getPinyin(w.zh)
        const inDict = db.words.some(dw => dw.zh === w.zh)
        return `<div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:8px">
          <div style="flex:1;min-width:0">
            <div style="font-family:'Noto Serif SC',serif;font-size:17px;font-weight:600;color:var(--text)">${w.zh}</div>
            <div style="font-size:11px;color:var(--red);font-weight:500;display:flex;align-items:center;gap:5px;flex-wrap:wrap">
              ${py}${w.pos ? `<span style="font-size:10px;font-weight:700;color:var(--text3);background:var(--surface2);border:1px solid var(--border2);border-radius:4px;padding:0 5px;letter-spacing:.4px;line-height:1.6">${w.pos}</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px">${w.vi || ''}</div>
            ${w.exZh ? `<div style="font-size:11px;color:var(--text3);font-family:'Noto Sans SC',sans-serif;margin-top:3px">${w.exZh}</div>` : ''}
          </div>
          <button class="tb-vocab-add-btn${inDict ? ' added' : ''}" data-vi="${i}"
            style="flex-shrink:0;margin-top:2px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;
              border:1.5px solid ${inDict ? 'var(--green)' : 'var(--red)'};
              background:${inDict ? 'var(--green-light)' : 'transparent'};
              color:${inDict ? 'var(--green)' : 'var(--red)'};font-family:'DM Sans',sans-serif"
            ${inDict ? 'disabled' : ''}>
            ${inDict ? '✓' : '+'}
          </button>
        </div>`
      }).join('')

  vocabEl.innerHTML = adminBar + wordsHtml

  vocabEl.querySelectorAll('.tb-vocab-add-btn:not(.added)').forEach(btn => {
    btn.addEventListener('click', () => {
      const w = words[parseInt((btn as HTMLElement).dataset.vi!)]
      const added = addWordFromTextbook(w.zh, w.vi || '', w.exZh || '', w.exVi || '', w.note || '')
      if (added) {
        ;(btn as HTMLElement).textContent = '✓'
        btn.classList.add('added')
        ;(btn as HTMLElement).style.borderColor = 'var(--green)'
        ;(btn as HTMLElement).style.background  = 'var(--green-light)'
        ;(btn as HTMLElement).style.color       = 'var(--green)'
        ;(btn as HTMLButtonElement).disabled = true
      }
    })
  })

  if (isAdmin) {
    $('tb-import-vocab-btn')?.addEventListener('click', () => ($('tb-import-vocab-file') as HTMLInputElement | null)?.click())
    $('tb-import-vocab-file')?.addEventListener('change', tbHandleVocabImport)
  }
}

// ── Vocab bulk import ──────────────────────────────────────────────────────────
function tbHandleVocabImport(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(e.target as HTMLInputElement).value = ''
  const reader = new FileReader()
  reader.onload = (evt: ProgressEvent<FileReader>) => {
    let words: any[] = []
    try {
      const text = evt.target!.result as string
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text)
        words = Array.isArray(parsed) ? parsed : []
      } else {
        words = tbParseCSV(text)
      }
    } catch (err: any) { toast('Lỗi đọc file: ' + err.message); return }
    words = words.filter(w => w.zh && w.vi)
    if (!words.length) { toast('Không tìm thấy từ vựng hợp lệ trong file.'); return }
    tbShowImportPreview(words)
  }
  reader.readAsText(file, 'UTF-8')
}

function tbParseCSV(text: string): any[] {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l)
  if (lines.length < 2) return []
  const headers = tbSplitCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''))
  return lines.slice(1).map(line => {
    const vals = tbSplitCSVLine(line)
    const get  = (...keys: string[]) => {
      for (const k of keys) { const i = headers.indexOf(k); if (i >= 0) return (vals[i] || '').trim() }
      return ''
    }
    return {
      zh:   get('zh'),
      vi:   get('vi'),
      exZh: get('exzh'),
      exVi: get('exvi'),
      note: get('note'),
      pos:  get('pos', 'type', 'loai', 'wordtype'),
    }
  })
}

function tbSplitCSVLine(line: string): string[] {
  const res: string[] = []; let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { res.push(cur); cur = '' }
    else { cur += ch }
  }
  res.push(cur)
  return res.map(v => v.replace(/^"|"$/g, '').trim())
}

function tbShowImportPreview(newWords: any[]): void {
  const existing = tbState.articleData?.words || []
  const toAdd    = newWords.filter((w: any) => !existing.some((e: any) => e.zh === w.zh))
  const dupes    = newWords.length - toAdd.length

  const overlay  = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center'
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:28px;width:min(500px,92vw);max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <h3 style="font-size:17px;font-weight:700;margin:0 0 8px">📥 Xác nhận import từ vựng</h3>
      <p style="font-size:13px;color:var(--text2);margin:0 0 16px;line-height:1.6">
        Tìm thấy <strong>${newWords.length} từ</strong> trong file.
        ${dupes ? `<span style="color:var(--text3)"> · ${dupes} từ trùng sẽ bỏ qua</span>` : ''}
        <br>Sẽ thêm: <strong style="color:var(--red)">${toAdd.length} từ mới</strong>
      </p>
      <div style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:18px;min-height:0">
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface2);position:sticky;top:0">
              <th style="padding:8px 12px;text-align:left;color:var(--text3);font-weight:500;font-size:11px">CHỮ HÁN</th>
              <th style="padding:8px;text-align:left;color:var(--text3);font-weight:500;font-size:11px">TỪ LOẠI</th>
              <th style="padding:8px;text-align:left;color:var(--text3);font-weight:500;font-size:11px">NGHĨA</th>
              <th style="padding:8px;text-align:left;color:var(--text3);font-weight:500;font-size:11px">VÍ DỤ</th>
            </tr>
          </thead>
          <tbody>
            ${toAdd.slice(0, 100).map((w: any) => `
              <tr style="border-top:1px solid var(--border)">
                <td style="padding:7px 12px;font-family:'Noto Serif SC',serif;font-size:15px;font-weight:600">${w.zh}</td>
                <td style="padding:7px 8px;font-size:11px">${w.pos ? `<span style="font-weight:700;color:var(--text3);background:var(--surface2);border:1px solid var(--border2);border-radius:4px;padding:1px 6px;letter-spacing:.4px">${w.pos}</span>` : ''}</td>
                <td style="padding:7px 8px;color:var(--text2);font-size:12px">${w.vi}</td>
                <td style="padding:7px 8px;color:var(--text3);font-size:11px;font-family:'Noto Sans SC',sans-serif">${w.exZh || ''}</td>
              </tr>`).join('')}
            ${toAdd.length > 100 ? `<tr><td colspan="3" style="padding:8px 12px;color:var(--text3);text-align:center;font-size:12px">... và ${toAdd.length - 100} từ khác</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px">
        <button id="tb-imp-cancel" style="flex:1;padding:12px;background:var(--surface2);border:1.5px solid var(--border2);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;color:var(--text2);font-family:'DM Sans',sans-serif">Huỷ</button>
        <button id="tb-imp-confirm" style="flex:2;padding:12px;background:var(--red);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif"
          ${toAdd.length === 0 ? 'disabled style="opacity:.5"' : ''}>
          ✓ Import ${toAdd.length} từ
        </button>
      </div>
    </div>`

  document.body.appendChild(overlay)
  ;(overlay.querySelector('#tb-imp-cancel') as HTMLElement).onclick = () => overlay.remove()
  ;(overlay.querySelector('#tb-imp-confirm') as HTMLElement).onclick = async () => {
    if (!toAdd.length) return
    const updated = [...existing, ...toAdd]
    try {
      await updateDoc(
        doc(firestore, 'textbooks', tbState.bookId!, 'articles', tbState.articleId!),
        { words: updated },
      )
      if (tbState.articleData) tbState.articleData.words = updated
      tbRenderArticleVocabPanel(updated)
      overlay.remove()
      toast(`✓ Đã import ${toAdd.length} từ vựng!`)
    } catch (err: any) { toast('Lỗi: ' + err.message) }
  }
}

async function tbSaveWordToArticle(zh: string, vi: string, exZh: string, exVi: string, note: string): Promise<void> {
  if (!tbState.bookId || !tbState.articleId) return
  try {
    const artRef  = doc(firestore, 'textbooks', tbState.bookId, 'articles', tbState.articleId)
    const snap    = await getDoc(artRef)
    if (!snap.exists()) return
    const existing = snap.data().words || []
    if (existing.some((w: any) => w.zh === zh)) return
    const updated = [...existing, { zh, vi, exZh: exZh || '', exVi: exVi || '', note: note || '' }]
    await updateDoc(artRef, { words: updated })
    if (tbState.articleData) tbState.articleData.words = updated
    tbRenderArticleVocabPanel(updated)
    tbSyncWordCount(tbState.bookId)  // fire-and-forget: update cached word count
  } catch (e) { console.error(e) }
}

// ── Word-count denormalisation ─────────────────────────────────────────────────
async function tbSyncWordCount(bookId: string): Promise<number> {
  try {
    const [bookSnap, artSnap] = await Promise.all([
      getDoc(doc(firestore, 'textbooks', bookId)),
      getDocs(collection(firestore, 'textbooks', bookId, 'articles')),
    ])
    const seen = new Set<string>()
    ;(bookSnap.data()?.words || []).forEach((w: any) => { if (w.zh) seen.add(w.zh) })
    artSnap.docs.forEach(d => {
      ;(d.data().words || []).forEach((w: any) => { if (w.zh) seen.add(w.zh) })
    })
    await updateDoc(doc(firestore, 'textbooks', bookId), { wordCount: seen.size })
    return seen.size
  } catch (e) { console.error('tbSyncWordCount:', e); return 0 }
}

async function tbApplyAndSaveFreeHighlight(text: string, color: string): Promise<void> {
  if (!tbState.articleData) return
  const article = tbState.articleData
  if (!article.freeHighlights) article.freeHighlights = []
  article.freeHighlights = article.freeHighlights.filter((h: any) => h.text !== text)
  article.freeHighlights.push({ text, color })
  const bd = $('tb-art-reader-body')
  if (bd) bd.innerHTML = applyFreeHighlight(bd.innerHTML, { text, color })
  if (tbState.bookId && tbState.articleId) {
    try {
      await updateDoc(
        doc(firestore, 'textbooks', tbState.bookId, 'articles', tbState.articleId),
        { freeHighlights: article.freeHighlights },
      )
    } catch (e) { console.error(e) }
  }
}

async function tbRemoveFreeHighlight(text: string): Promise<void> {
  if (!tbState.articleData) return
  const article = tbState.articleData
  article.freeHighlights = (article.freeHighlights || []).filter((h: any) => h.text !== text)
  if (tbState.bookId && tbState.articleId) {
    try {
      await updateDoc(
        doc(firestore, 'textbooks', tbState.bookId, 'articles', tbState.articleId),
        { freeHighlights: article.freeHighlights },
      )
    } catch (e) { console.error(e) }
  }
  tbRenderTbArticleBody(article)
}

function setupTbArtTextSelection(): void {
  // Delegate most of the wiring to the shared helper (isTbMode=true)
  // It handles: mouseup detection, choice popup, add-word popup, grammar btn
  // For TB mode, highlight color and remove need TB-specific save handlers
  setupTextSelection(true)

  // Override highlight color buttons to use TB-specific save
  const hlPopup = $('highlight-popup')
  if (hlPopup) {
    hlPopup.querySelectorAll('.hl-color-btn').forEach(btn => {
      ;(btn as HTMLElement).onclick = () => {
        const text = (hlPopup as HTMLElement).dataset.text
        if (!text) return
        tbApplyAndSaveFreeHighlight(text, (btn as HTMLElement).dataset.color!)
        hlPopup.style.display = 'none'
        window.getSelection()?.removeAllRanges()
      }
    })
    const hlRemoveBtn = $('hlpopup-remove')
    if (hlRemoveBtn) {
      hlRemoveBtn.onclick = () => {
        const text = (hlPopup as HTMLElement).dataset.text
        if (!text) return
        tbRemoveFreeHighlight(text)
        hlPopup.style.display = 'none'
        window.getSelection()?.removeAllRanges()
      }
    }
  }

  // Override the popup-add-btn to also save to article vocab
  const popup = $('selection-popup')
  if (popup) {
    const origAddBtn = $('popup-add-btn')
    if (origAddBtn) {
      origAddBtn.onclick = async () => {
        const zh   = ($('popup-word') as HTMLElement | null)?.textContent?.trim() || ''
        const vi   = ($('popup-vi-inp') as HTMLInputElement | null)?.value.trim() || ''
        const exZh = ($('popup-ex-zh-inp') as HTMLInputElement | null)?.value.trim() || ''
        const exVi = ($('popup-ex-vi-inp') as HTMLInputElement | null)?.value.trim() || ''
        const note = ($('popup-note-inp') as HTMLTextAreaElement | null)?.value.trim() || ''
        const w = addWordFromTextbook(zh, vi, exZh, exVi, note)
        if (w) {
          toast(`✓ Đã thêm: ${zh}`)
          popup.style.display = 'none'
          window.getSelection()?.removeAllRanges()
          tbSaveWordToArticle(zh, vi, exZh, exVi, note)
        } else {
          toast('Vui lòng nhập nghĩa!')
        }
      }
    }
  }
}

// ── Block editor (text + audio interleaving) ───────────────────────────────────
function tbInitBlocksEditor(article: any): void {
  _tbBlocks = (article?.blocks?.length)
    ? article.blocks.map((b: any) => ({ ...b }))
    : [{ type: 'text', content: article?.body || '' }]
  tbRenderBlocksEditor()
  const addTextBtn  = $('tb-blk-add-text')
  const addAudioBtn = $('tb-blk-add-audio')
  if (addTextBtn) addTextBtn.onclick = () => {
    tbCollectBlocksFromDOM()
    _tbBlocks.push({ type: 'text', content: '' })
    tbRenderBlocksEditor()
  }
  if (addAudioBtn) addAudioBtn.onclick = () => {
    tbCollectBlocksFromDOM()
    _tbBlocks.push({ type: 'audio', url: '', label: '' })
    tbRenderBlocksEditor()
  }
}

function tbCollectBlocksFromDOM(): void {
  const container = $('tb-art-blocks-container')
  if (!container) return
  container.querySelectorAll('.tb-block-item').forEach(el => {
    const i = parseInt((el as HTMLElement).dataset.bidx!)
    if (isNaN(i) || i < 0 || i >= _tbBlocks.length) return
    const b = _tbBlocks[i]
    if (b.type === 'text') {
      b.content = (el.querySelector('.tb-block-editor') as HTMLElement | null)?.innerHTML || ''
    } else {
      b.url   = ((el.querySelector('.tb-blk-url')   as HTMLInputElement | null)?.value || '').trim()
      b.label = ((el.querySelector('.tb-blk-label') as HTMLInputElement | null)?.value || '').trim()
    }
  })
}

function tbRenderBlocksEditor(): void {
  const container = $('tb-art-blocks-container')
  if (!container) return
  const n = _tbBlocks.length
  const inpStyle = 'width:100%;padding:7px 10px;border:1.5px solid var(--border2);border-radius:6px;background:var(--surface);color:var(--text);font-size:13px;font-family:\'DM Sans\',sans-serif;box-sizing:border-box;outline:none'
  container.innerHTML = _tbBlocks.map((b: any, i: number) => {
    const up  = i > 0     ? `<button type="button" class="tb-blk-btn tb-blk-up"  title="Lên">▲</button>` : ''
    const dn  = i < n - 1 ? `<button type="button" class="tb-blk-btn tb-blk-dn"  title="Xuống">▼</button>` : ''
    const del = n > 1     ? `<button type="button" class="tb-blk-btn tb-blk-del" title="Xoá" style="color:var(--red)">✕</button>` : ''
    const lbl  = b.type === 'audio' ? '🎵 Audio' : '📝 Văn bản'
    const body = b.type === 'audio'
      ? `<div class="tb-audio-inputs">
          <input class="tb-blk-label" type="text" placeholder="Nhãn hiển thị (e.g. Hội thoại, Phần 1...)" value="${(b.label || '').replace(/"/g, '&quot;')}" style="${inpStyle}">
          <input class="tb-blk-url"   type="text" placeholder="URL file audio (mp3, ogg, m4a...)"          value="${(b.url   || '').replace(/"/g, '&quot;')}" style="${inpStyle}">
          ${b.url ? `<audio controls preload="metadata" src="${b.url.replace(/"/g, '&quot;')}" style="width:100%;margin-top:2px"></audio>` : ''}
        </div>`
      : `<div class="tb-block-editor" contenteditable="true" data-placeholder="Dán nội dung tiếng Trung vào đây...">${b.content || ''}</div>`
    return `<div class="tb-block-item" data-bidx="${i}">
      <div class="tb-block-hdr">
        <span class="tb-block-type-lbl">${lbl}</span>
        <div style="display:flex;gap:3px">${up}${dn}${del}</div>
      </div>
      ${body}
    </div>`
  }).join('')

  // Move up
  container.querySelectorAll('.tb-blk-up').forEach(btn => {
    ;(btn as HTMLElement).onclick = () => {
      tbCollectBlocksFromDOM()
      const i = parseInt((btn.closest('.tb-block-item') as HTMLElement).dataset.bidx!)
      ;[_tbBlocks[i - 1], _tbBlocks[i]] = [_tbBlocks[i], _tbBlocks[i - 1]]
      tbRenderBlocksEditor()
    }
  })
  // Move down
  container.querySelectorAll('.tb-blk-dn').forEach(btn => {
    ;(btn as HTMLElement).onclick = () => {
      tbCollectBlocksFromDOM()
      const i = parseInt((btn.closest('.tb-block-item') as HTMLElement).dataset.bidx!)
      ;[_tbBlocks[i], _tbBlocks[i + 1]] = [_tbBlocks[i + 1], _tbBlocks[i]]
      tbRenderBlocksEditor()
    }
  })
  // Delete
  container.querySelectorAll('.tb-blk-del').forEach(btn => {
    ;(btn as HTMLElement).onclick = () => {
      if (!confirm('Xoá khối nội dung này?')) return
      tbCollectBlocksFromDOM()
      const i = parseInt((btn.closest('.tb-block-item') as HTMLElement).dataset.bidx!)
      _tbBlocks.splice(i, 1)
      tbRenderBlocksEditor()
    }
  })
  // Track focused text editor for toolbar (image insert)
  container.querySelectorAll('.tb-block-editor').forEach(ed => {
    ed.addEventListener('focus', () => { _tbLastFocusedEditor = ed as HTMLElement })
  })
  // Live audio preview when URL changes
  container.querySelectorAll('.tb-blk-url').forEach(inp => {
    inp.addEventListener('change', () => {
      const url  = (inp as HTMLInputElement).value.trim()
      const wrap = inp.closest('.tb-audio-inputs')
      let audio  = wrap?.querySelector('audio') as HTMLAudioElement | null
      if (url) {
        if (!audio) {
          audio = Object.assign(document.createElement('audio'), { controls: true, preload: 'metadata' }) as HTMLAudioElement
          audio.style.cssText = 'width:100%;margin-top:2px'
          wrap!.appendChild(audio)
        }
        audio.src = url
        audio.load()
      } else if (audio) {
        audio.remove()
      }
    })
  })
  // Focus last focused editor or first one
  if (!_tbLastFocusedEditor || !container.contains(_tbLastFocusedEditor)) {
    _tbLastFocusedEditor = container.querySelector('.tb-block-editor') as HTMLElement | null
  }
}

function tbShowAddArticleModal(book: any): void {
  const overlay = $('tb-add-article-overlay')
  if (!overlay) return
  _tbArticleEditId = null
  const bookNameEl = $('tb-add-art-book-name')
  if (bookNameEl) bookNameEl.textContent = book.title
  const titleInp  = $('tb-art-title-inp')  as HTMLInputElement | null
  const sourceInp = $('tb-art-source-inp') as HTMLInputElement | null
  if (titleInp)  titleInp.value  = ''
  if (sourceInp) sourceInp.value = ''
  const vocabRows = $('tb-art-vocab-rows')
  if (vocabRows) vocabRows.innerHTML = ''
  overlay.style.display = 'flex'
  _tbLastFocusedEditor = null
  tbInitBlocksEditor(null)
  setupTbRichToolbar()
}

function tbShowEditArticleModal(article: any): void {
  const overlay = $('tb-add-article-overlay')
  if (!overlay) return
  _tbArticleEditId = article.id
  const bookNameEl = $('tb-add-art-book-name')
  if (bookNameEl) bookNameEl.textContent = tbState.bookData?.title || ''
  const titleInp  = $('tb-art-title-inp')  as HTMLInputElement | null
  const sourceInp = $('tb-art-source-inp') as HTMLInputElement | null
  if (titleInp)  titleInp.value  = article.title  || ''
  if (sourceInp) sourceInp.value = article.source || ''
  const rows = $('tb-art-vocab-rows')
  if (rows) { rows.innerHTML = ''; (article.words || []).forEach((w: any) => tbAddVocabRow(w)) }
  overlay.style.display = 'flex'
  _tbLastFocusedEditor = null
  tbInitBlocksEditor(article)
  setupTbRichToolbar()
}

function setupTbRichToolbar(): void {
  const toolbar = $('tb-art-rich-toolbar')
  if (!toolbar) return
  toolbar.querySelectorAll('.rtb-btn').forEach(btn => {
    if (btn.id === 'tb-art-img-btn') return
    // prevent mousedown from stealing focus away from the active editor
    ;(btn as HTMLElement).onmousedown = e => e.preventDefault()
    ;(btn as HTMLElement).onclick = e => {
      e.preventDefault()
      document.execCommand((btn as HTMLElement).dataset.cmd!, false, (btn as HTMLElement).dataset.val || null)
    }
  })
  const imgBtn = $('tb-art-img-btn')
  if (imgBtn) {
    ;(imgBtn as HTMLElement).onmousedown = e => e.preventDefault()
    ;(imgBtn as HTMLElement).onclick = e => {
      e.preventDefault()
      const url = prompt('Nhập URL ảnh (link trực tiếp):')
      if (!url?.trim()) return
      if (_tbLastFocusedEditor) _tbLastFocusedEditor.focus()
      document.execCommand('insertHTML', false,
        `<img src="${url.trim()}" style="max-width:100%;border-radius:8px;margin:8px 0;display:block">`)
    }
  }
}

function tbAddVocabRow(data: any = {}): void {
  const rows = $('tb-art-vocab-rows')
  if (!rows) return
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px'
  row.innerHTML = `
    <input type="text" class="tb-vr-zh" placeholder="汉字 *" value="${data.zh || ''}"
      style="flex:0 0 110px;padding:8px 10px;border:1.5px solid var(--border2);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:14px;font-family:'Noto Sans SC',sans-serif">
    <input type="text" class="tb-vr-vi" placeholder="Nghĩa *" value="${data.vi || ''}"
      style="flex:1;padding:8px 10px;border:1.5px solid var(--border2);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:14px;font-family:'DM Sans',sans-serif">
    <input type="text" class="tb-vr-exzh" placeholder="Ví dụ (tuỳ chọn)" value="${data.exZh || ''}"
      style="flex:1;padding:8px 10px;border:1.5px solid var(--border2);border-radius:var(--radius-sm);background:var(--surface);color:var(--text);font-size:13px;font-family:'Noto Sans SC',sans-serif">
    <button class="tb-vr-rm" style="flex-shrink:0;padding:6px 10px;background:none;border:1.5px solid var(--border2);border-radius:var(--radius-sm);font-size:13px;cursor:pointer;color:var(--text3)">✕</button>`
  ;(row.querySelector('.tb-vr-rm') as HTMLElement).addEventListener('click', () => row.remove())
  rows.appendChild(row)
}

async function tbSaveArticle(): Promise<void> {
  if (auth.currentUser?.email !== 'hoang1886@gmail.com') return
  const title  = ($('tb-art-title-inp')  as HTMLInputElement | null)?.value.trim() || ''
  const source = ($('tb-art-source-inp') as HTMLInputElement | null)?.value.trim() || ''
  if (!title) { toast('Vui lòng nhập tiêu đề bài đọc'); return }

  tbCollectBlocksFromDOM()
  const blocks = _tbBlocks.filter((b: any) =>
    b.type === 'audio' ? b.url?.trim() : b.content?.replace(/<[^>]*>/g, '').trim(),
  )
  if (!blocks.length) { toast('Vui lòng nhập nội dung bài đọc'); return }
  // Keep body = first text block for backward compat
  const body = blocks.find((b: any) => b.type === 'text')?.content || ''

  const words = [...($('tb-art-vocab-rows')?.querySelectorAll('div') || [])].map(row => ({
    zh:   (row.querySelector('.tb-vr-zh')   as HTMLInputElement | null)?.value.trim()   || '',
    vi:   (row.querySelector('.tb-vr-vi')   as HTMLInputElement | null)?.value.trim()   || '',
    exZh: (row.querySelector('.tb-vr-exzh') as HTMLInputElement | null)?.value.trim()   || '',
    exVi: '', note: '',
  })).filter(w => w.zh && w.vi)

  try {
    if (_tbArticleEditId) {
      await updateDoc(
        doc(firestore, 'textbooks', tbState.bookId!, 'articles', _tbArticleEditId),
        { title, source, body, blocks, words },
      )
      const overlay = $('tb-add-article-overlay')
      if (overlay) overlay.style.display = 'none'
      toast('✓ Đã cập nhật bài đọc!')
      _tbArticleEditId = null
      if (tbState.view === 'article') await tbRenderArticle()
      else if (tbState.bookData) await tbRenderBookTabContent(tbState.bookData)
    } else {
      const colRef   = collection(firestore, 'textbooks', tbState.bookId!, 'articles')
      const existing = await getDocs(query(colRef, orderBy('order')))
      await addDoc(colRef, {
        title, source, body, blocks, words,
        order: existing.size + 1, createdAt: new Date().toISOString(),
      })
      const overlay = $('tb-add-article-overlay')
      if (overlay) overlay.style.display = 'none'
      toast('✓ Đã thêm bài đọc!')
      if (tbState.bookData) await tbRenderBookTabContent(tbState.bookData)
    }
    // Sync word count on book doc regardless of create/update
    if (tbState.bookId) tbSyncWordCount(tbState.bookId)
  } catch (e: any) { toast('Lỗi: ' + e.message) }
}

// ── Add word to SRS dictionary from textbook ───────────────────────────────────
function addWordFromTextbook(zh: string, vi: string, exZh = '', exVi = '', note = ''): any {
  if (!zh || !vi) { toast('Vui lòng nhập chữ Hán và nghĩa!'); return false }
  if (db.words.some(w => w.zh === zh)) { toast(`"${zh}" đã có trong từ điển`); return false }
  const newWord: any = {
    id: Date.now(), zh, vi, pinyin: getPinyin(zh), zhDef: '',
    exZh, exVi, note, wordType: '',
    status: 'new', ef: 2.5, interval: 0, repetitions: 0,
    nextReview: null, lastReview: null, added: Date.now(),
  }
  db.words.push(newWord)
  save()
  toast(`✓ Đã thêm: ${zh}`)
  return newWord
}

// ── Admin: show add-book modal ─────────────────────────────────────────────────
function tbShowAddBookModal(level: number): void {
  const overlay = $('tb-add-book-overlay')
  if (!overlay) return
  _tbBookEditId = null
  const levelEl = $('tb-add-book-level')
  if (levelEl) levelEl.textContent = `HSK ${level}`
  ;($('tb-book-title-inp')    as HTMLInputElement | null && ($('tb-book-title-inp')    as HTMLInputElement)).value
  ;($('tb-book-subtitle-inp') as HTMLInputElement | null && ($('tb-book-subtitle-inp') as HTMLInputElement)).value
  const titleInp    = $('tb-book-title-inp')    as HTMLInputElement | null
  const subtitleInp = $('tb-book-subtitle-inp') as HTMLInputElement | null
  if (titleInp)    titleInp.value    = ''
  if (subtitleInp) subtitleInp.value = ''
  const imgInp = $('tb-book-img-inp') as HTMLInputElement | null
  if (imgInp) imgInp.value = ''
  const imgPreview = $('tb-book-img-preview')
  if (imgPreview) imgPreview.style.display = 'none'
  overlay.style.display = 'flex'
  tbSetupBookImgPreview()
}

function tbShowEditBookModal(book: any): void {
  const overlay = $('tb-add-book-overlay')
  if (!overlay) return
  _tbBookEditId = book.id
  const levelEl = $('tb-add-book-level')
  if (levelEl) levelEl.textContent = `HSK ${tbState.level}`
  const titleInp    = $('tb-book-title-inp')    as HTMLInputElement | null
  const subtitleInp = $('tb-book-subtitle-inp') as HTMLInputElement | null
  if (titleInp)    titleInp.value    = book.title    || ''
  if (subtitleInp) subtitleInp.value = book.subtitle || ''
  const sel = $('tb-book-type-select') as HTMLSelectElement | null
  if (sel) sel.value = book.type || 'jiaocheng'
  const imgInp = $('tb-book-img-inp') as HTMLInputElement | null
  if (imgInp) imgInp.value = book.imageUrl || ''
  tbUpdateBookImgPreview(book.imageUrl || '')
  overlay.style.display = 'flex'
  tbSetupBookImgPreview()
}

function tbSetupBookImgPreview(): void {
  const inp = $('tb-book-img-inp') as HTMLInputElement | null
  if (!inp) return
  inp.oninput = () => tbUpdateBookImgPreview(inp.value.trim())
}

function tbUpdateBookImgPreview(url: string): void {
  const wrap = $('tb-book-img-preview')
  const img  = $('tb-book-img-preview-img') as HTMLImageElement | null
  if (!wrap || !img) return
  if (url) {
    img.src = url
    img.onerror = () => { wrap.style.display = 'none' }
    img.onload  = () => { wrap.style.display = 'block' }
    wrap.style.display = 'block'
  } else {
    wrap.style.display = 'none'
  }
}

async function tbSaveBook(): Promise<void> {
  if (auth.currentUser?.email !== 'hoang1886@gmail.com') return
  const title    = ($('tb-book-title-inp')    as HTMLInputElement | null)?.value.trim() || ''
  const subtitle = ($('tb-book-subtitle-inp') as HTMLInputElement | null)?.value.trim() || ''
  const type     = ($('tb-book-type-select')  as HTMLSelectElement | null)?.value || ''
  const imageUrl = ($('tb-book-img-inp')      as HTMLInputElement | null)?.value.trim() || ''
  if (!title) { toast('Vui lòng nhập tiêu đề sách'); return }
  try {
    if (_tbBookEditId) {
      await updateDoc(doc(firestore, 'textbooks', _tbBookEditId), { title, subtitle, type, imageUrl })
      const overlay = $('tb-add-book-overlay')
      if (overlay) overlay.style.display = 'none'
      toast('✓ Đã cập nhật sách!')
      _tbBookEditId = null
      await tbRenderWords()
    } else {
      const existing = tbState.booksCache[tbState.level!] || []
      await addDoc(collection(firestore, 'textbooks'), {
        level: tbState.level, title, subtitle, type, imageUrl,
        order: existing.length + 1, words: [],
        createdAt: new Date().toISOString(),
      })
      const overlay = $('tb-add-book-overlay')
      if (overlay) overlay.style.display = 'none'
      const titleInp    = $('tb-book-title-inp')    as HTMLInputElement | null
      const subtitleInp = $('tb-book-subtitle-inp') as HTMLInputElement | null
      if (titleInp)    titleInp.value    = ''
      if (subtitleInp) subtitleInp.value = ''
      toast('✓ Đã thêm sách!')
      await tbRenderBooks()
    }
  } catch (e: any) { toast('Lỗi: ' + e.message) }
}

// ── Admin: show add-word modal ─────────────────────────────────────────────────
function tbShowAddWordModal(book: any): void {
  const overlay = $('tb-add-word-overlay')
  if (!overlay) return
  const bookNameEl = $('tb-word-book-name')
  if (bookNameEl) bookNameEl.textContent = book.title
  overlay.style.display = 'flex'
}

async function tbSaveWord(): Promise<void> {
  if (auth.currentUser?.email !== 'hoang1886@gmail.com') return
  const zh   = ($('tb-word-zh-inp')   as HTMLInputElement | null)?.value.trim() || ''
  const vi   = ($('tb-word-vi-inp')   as HTMLInputElement | null)?.value.trim() || ''
  const exZh = ($('tb-word-exzh-inp') as HTMLInputElement | null)?.value.trim() || ''
  const exVi = ($('tb-word-exvi-inp') as HTMLInputElement | null)?.value.trim() || ''
  const note = ($('tb-word-note-inp') as HTMLInputElement | null)?.value.trim() || ''
  if (!zh || !vi) { toast('Vui lòng nhập chữ Hán và nghĩa tiếng Việt'); return }
  const book = tbState.bookData
  if (!book) return
  const words = [...(book.words || []), { zh, vi, exZh, exVi, note }]
  try {
    await updateDoc(doc(firestore, 'textbooks', book.id), { words })
    const overlay = $('tb-add-word-overlay')
    if (overlay) overlay.style.display = 'none'
    ;['tb-word-zh-inp', 'tb-word-vi-inp', 'tb-word-exzh-inp', 'tb-word-exvi-inp', 'tb-word-note-inp']
      .forEach(id => { const el = $(id) as HTMLInputElement | null; if (el) el.value = '' })
    toast('✓ Đã thêm từ!')
    await tbRenderWords()
  } catch (e: any) { toast('Lỗi: ' + e.message) }
}

// ── Init textbooks nav ─────────────────────────────────────────────────────────
export function initTbNav(): void {
  $('nav-textbooks')?.addEventListener('click', () => nav('textbooks'))
  $('tb-add-book-cancel')?.addEventListener('click',  () => { const o = $('tb-add-book-overlay');    if (o) o.style.display = 'none' })
  $('tb-add-book-cancel2')?.addEventListener('click', () => { const o = $('tb-add-book-overlay');    if (o) o.style.display = 'none' })
  $('tb-add-book-save')?.addEventListener('click', tbSaveBook)
  $('tb-add-word-cancel')?.addEventListener('click',  () => { const o = $('tb-add-word-overlay');    if (o) o.style.display = 'none' })
  $('tb-add-word-cancel2')?.addEventListener('click', () => { const o = $('tb-add-word-overlay');    if (o) o.style.display = 'none' })
  $('tb-add-word-save')?.addEventListener('click', tbSaveWord)
  $('tb-add-article-cancel')?.addEventListener('click',  () => { const o = $('tb-add-article-overlay'); if (o) o.style.display = 'none' })
  $('tb-add-article-cancel2')?.addEventListener('click', () => { const o = $('tb-add-article-overlay'); if (o) o.style.display = 'none' })
  $('tb-add-article-save')?.addEventListener('click', tbSaveArticle)
  $('tb-art-add-vocab-row-btn')?.addEventListener('click', () => tbAddVocabRow())
}
