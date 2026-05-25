import {
  db, wordFilter, selectedType, editSelectedTypes,
  setSelectedType, setEditSelectedTypes,
} from '../state'
import { $, toast, getPinyin, tr, getWtInfo, buildWordTypeSelector, resetWordTypeSelector, buildMultiTypeSelector } from '../utils'
import { save } from '../sync'
import { nav } from '../router'
import { lookupDict } from '../dict'

export function seedWords(): void {
  const seeds = [
    { zh:'你好', vi:'xin chào',  wordType:'动词', exZh:'你好，很高兴认识你。', exVi:'Xin chào, rất vui được gặp bạn.' },
    { zh:'谢谢', vi:'cảm ơn',    wordType:'动词', exZh:'谢谢你的帮助！',       exVi:'Cảm ơn sự giúp đỡ của bạn!' },
    { zh:'学习', vi:'học tập',   wordType:'动词', exZh:'我喜欢学习汉语。',     exVi:'Tôi thích học tiếng Trung.' },
    { zh:'漂亮', vi:'xinh đẹp',  wordType:'形容词', exZh:'她很漂亮。',          exVi:'Cô ấy rất xinh đẹp.' },
    { zh:'工作', vi:'công việc', wordType:'名词', exZh:'我的工作很有趣。',     exVi:'Công việc của tôi rất thú vị.' },
  ]
  seeds.forEach(s => db.words.push({
    id: Date.now() + Math.random(),
    zh: s.zh, vi: s.vi, pinyin: getPinyin(s.zh), zhDef: '', exZh: s.exZh, exVi: s.exVi, note: '',
    wordType: s.wordType, status: 'new', ef: 2.5, interval: 0, repetitions: 0, nextReview: null, lastReview: null, added: Date.now(),
  } as any))
}

export function addWord(): void {
  const zh = ($('inp-zh') as HTMLInputElement)?.value.trim()
  const vi = ($('inp-vi') as HTMLInputElement)?.value.trim()
  if (!zh || !vi) { toast('Vui lòng nhập chữ Hán và nghĩa!'); return }
  db.words.push({
    id: Date.now(), zh, vi, pinyin: getPinyin(zh),
    zhDef: ($('inp-zh-def') as HTMLInputElement)?.value.trim() || '',
    exZh:  ($('inp-ex-zh')  as HTMLTextAreaElement)?.value.trim() || '',
    exVi:  ($('inp-ex-vi')  as HTMLTextAreaElement)?.value.trim() || '',
    note:  ($('inp-note')   as HTMLTextAreaElement)?.value.trim() || '',
    wordType: selectedType || '', status: 'new', ef: 2.5, interval: 0,
    repetitions: 0, nextReview: null, lastReview: null, added: Date.now(),
  } as any)
  save()
  ;['inp-zh','inp-vi','inp-zh-def','inp-ex-zh','inp-ex-vi','inp-note'].forEach(id => {
    const el = $(id) as HTMLInputElement | null
    if (el) el.value = ''
  })
  ;($('pinyin-preview') as HTMLElement).textContent = ''
  resetWordTypeSelector('word-type-selector', setSelectedType)
  toast(`✓ Đã thêm: ${zh}`)
}

export function addWordFromArticle(
  zh: string, vi: string, exZh = '', exVi = '', zhDef = '', wordType = '', note = '', articleId?: number,
): any {
  if (!zh || !vi) { toast('Vui lòng nhập chữ Hán và nghĩa!'); return false }
  if (articleId != null) {
    const article = db.articles.find(a => a.id === articleId)
    if (article?.linkedWords) {
      const already = db.words.find(w => w.zh === zh && article.linkedWords!.includes(w.id))
      if (already) { toast(`"${zh}" đã được thêm rồi`); return false }
    }
  }
  const newWord = {
    id: Date.now() + Math.random(), zh, vi, pinyin: getPinyin(zh), zhDef, exZh, exVi,
    note: note || '', wordType: wordType || '', status: 'new', ef: 2.5, interval: 0,
    repetitions: 0, nextReview: null, lastReview: null, added: Date.now(),
  } as any
  db.words.push(newWord)
  if (articleId != null) {
    const article = db.articles.find(a => a.id === articleId)
    if (article) {
      if (!article.linkedWords) article.linkedWords = []
      article.linkedWords.push(newWord.id)
      article.addedWords = article.linkedWords.length
    }
  }
  save()
  return newWord
}

// Tracks the original zh of the word currently open in the edit modal
// so saveWordEdit() can find it even if the user changes the zh field.
let _editingZh = ''

export function renderWordList(q = ''): void {
  q = q.toLowerCase()
  const now = Date.now()
  const base = wordFilter === 'due'     ? db.words.filter(w => !w.nextReview || w.nextReview <= now)
             : wordFilter === 'learned' ? db.words.filter(w => w.repetitions > 0 && w.status !== 'mastered')
             : wordFilter === 'mastered'? db.words.filter(w => w.status === 'mastered')
             : db.words
  const labels: Record<string, string> = { all:'Tất cả từ', due:'Cần ôn tập', learned:'Đã học', mastered:'Thành thạo' }
  ;($('wordlist-count') as HTMLElement).textContent = `${db.words.length} từ trong thư viện`
  const pillEl = $('wordlist-filter-pill')!
  pillEl.innerHTML = wordFilter !== 'all'
    ? `<div class="filter-pill f${wordFilter}">${labels[wordFilter]} <span class="filter-clear" id="clear-filter">✕</span></div>`
    : ''
  document.getElementById('clear-filter')?.addEventListener('click', () => {
    import('../state').then(({ setWordFilter }) => setWordFilter('all'))
    renderWordList(($('search-input') as HTMLInputElement)?.value || '')
  })
  const filtered = base.filter(w => !q || w.zh.includes(q) || w.vi.toLowerCase().includes(q) || w.pinyin.toLowerCase().includes(q))
  const sl: Record<string, string> = { new:'Mới', learning:'Đang học', review:'Ôn tập', mastered:'Thành thạo' }
  const sb: Record<string, string> = { new:'badge-new', learning:'badge-learning', review:'badge-review', mastered:'badge-mastered' }
  const tbody = $('word-table-body')!
  tbody.innerHTML = filtered.length
    ? [...filtered].reverse().map(w => {
        const wts = w.wordTypes?.length ? w.wordTypes : (w.wordType ? [w.wordType] : [])
        const wtBadges = wts.map(k => {
          const i = getWtInfo(k)
          return i ? `<span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${i.bg};color:${i.color};white-space:nowrap;display:inline-block">${i.key} ${i.vi}</span>` : ''
        }).join('')
        const wtHtml = `<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">
          ${wtBadges || '<span style="color:var(--text4);font-size:12px">—</span>'}
          <button class="wt-add-btn" data-id="${w.id}" data-zh="${w.zh}" title="Chỉnh loại từ" style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#ff6b8a,#e8194b);color:#fff;border:none;cursor:pointer;font-size:14px;font-weight:700;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-left:2px;line-height:1">+</button>
        </div>`
        return `<tr>
          <td style="font-family:'Noto Serif SC',serif;font-size:19px;font-weight:600">${tr(w.zh)}</td>
          <td style="color:var(--red);font-weight:500">${w.pinyin}</td>
          <td>${w.vi}</td>
          <td>${wtHtml}</td>
          <td><span class="badge ${sb[w.status] || 'badge-new'}">${sl[w.status] || 'Mới'}</span></td>
          <td style="color:var(--text2);font-size:13px">${!w.nextReview ? 'Ngay bây giờ' : new Date(w.nextReview).toLocaleDateString('vi-VN')}</td>
          <td><div style="display:flex;gap:6px;align-items:center"><button class="edit-btn" data-id="${w.id}" data-zh="${w.zh}" title="Sửa">✏️</button><button class="del-btn" data-id="${w.id}" data-zh="${w.zh}">✕</button></div></td>
        </tr>`
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:28px">Không tìm thấy từ nào.</td></tr>'
  tbody.querySelectorAll('.del-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement
      deleteWord(el.dataset.zh || '', Number(el.dataset.id))
    })
  )
  tbody.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement
      openWordEditor(el.dataset.zh || '', Number(el.dataset.id))
    })
  )
  tbody.querySelectorAll('.wt-add-btn').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const el = btn as HTMLElement
      openWordTypeEditor(el.dataset.zh || '', Number(el.dataset.id), btn as HTMLElement)
    })
  )
}

function deleteWord(zh: string, id: number): void {
  if (!confirm('Xoá từ này?')) return
  db.words = db.words.filter(w => zh ? w.zh !== zh : w.id !== id)
  save(); renderWordList(($('search-input') as HTMLInputElement)?.value || ''); toast('Đã xoá từ.')
}

function openWordEditor(zh: string, id: number): void {
  const word = (zh ? db.words.find(w => w.zh === zh) : null) ?? db.words.find(w => w.id === id)
  if (!word) return
  _editingZh = word.zh
  ;($('edit-word-id') as HTMLInputElement).value = String(id)
  ;($('edit-inp-zh') as HTMLInputElement).value  = word.zh || ''
  ;($('edit-pinyin-preview') as HTMLElement).textContent = word.pinyin || ''
  ;($('edit-inp-vi') as HTMLInputElement).value  = word.vi || ''
  ;($('edit-inp-zhdef') as HTMLInputElement).value = word.zhDef || ''
  ;($('edit-inp-exzh') as HTMLTextAreaElement).value = word.exZh || ''
  ;($('edit-inp-exvi') as HTMLTextAreaElement).value = word.exVi || ''
  const noteEl = $('edit-inp-note') as HTMLTextAreaElement | null
  if (noteEl) noteEl.value = word.note || ''
  setEditSelectedTypes(word.wordTypes?.length ? [...word.wordTypes] : (word.wordType ? [word.wordType] : []))
  buildMultiTypeSelector('edit-word-type-selector', () => editSelectedTypes, setEditSelectedTypes)
  $('word-edit-overlay')!.style.display = 'flex'
  setTimeout(() => ($('edit-inp-zh') as HTMLInputElement | null)?.focus(), 100)
}

function saveWordEdit(): void {
  const id = Number(($('edit-word-id') as HTMLInputElement).value)
  const zh = ($('edit-inp-zh') as HTMLInputElement).value.trim()
  const vi = ($('edit-inp-vi') as HTMLInputElement).value.trim()
  if (!zh || !vi) { toast('Vui lòng nhập chữ Hán và nghĩa!'); return }
  // Use _editingZh (original zh before any edits) as primary key; fall back to id
  const word = (_editingZh ? db.words.find(w => w.zh === _editingZh) : null) ?? db.words.find(w => w.id === id)
  _editingZh = ''
  if (!word) return
  word.zh = zh; word.pinyin = getPinyin(zh); word.vi = vi
  word.zhDef = ($('edit-inp-zhdef') as HTMLInputElement).value.trim()
  word.exZh  = ($('edit-inp-exzh') as HTMLTextAreaElement).value.trim()
  word.exVi  = ($('edit-inp-exvi') as HTMLTextAreaElement).value.trim()
  word.note  = ($('edit-inp-note') as HTMLTextAreaElement)?.value.trim() || ''
  word.wordTypes = [...editSelectedTypes]
  word.wordType  = word.wordTypes[0] || ''
  save()
  $('word-edit-overlay')!.style.display = 'none'
  renderWordList(($('search-input') as HTMLInputElement)?.value || '')
  toast('✓ Đã lưu thay đổi!')
}

function openWordTypeEditor(zh: string, wordId: number, anchorEl: HTMLElement): void {
  const word = (zh ? db.words.find(w => w.zh === zh) : null) ?? db.words.find(w => w.id === wordId)
  if (!word) return
  if (!word.wordTypes) word.wordTypes = word.wordType ? [word.wordType] : []
  const popover = $('wt-editor-popover')!, tagsEl = $('wt-editor-tags')!
  const render = () => {
    tagsEl.innerHTML = ''
    import('../constants').then(({ WORD_TYPES }) => {
      tagsEl.innerHTML = WORD_TYPES.map(t => {
        const active = word.wordTypes!.includes(t.key)
        return `<button class="wtype-tag${active ? ' active' : ''}" data-key="${t.key}" style="--wt-color:${t.color};--wt-bg:${t.bg};padding:3px 8px;font-size:11px">${t.key}<span class="wtype-vi"> ${t.vi}</span></button>`
      }).join('')
      tagsEl.querySelectorAll('.wtype-tag').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation()
          const k = (btn as HTMLElement).dataset.key!
          word.wordTypes = word.wordTypes!.includes(k) ? word.wordTypes!.filter(x => x !== k) : [...word.wordTypes!, k]
          save(); render()
        })
      })
    })
  }
  render()
  const rect = anchorEl.getBoundingClientRect()
  popover.style.top  = (rect.bottom + 8) + 'px'
  popover.style.left = Math.min(rect.left, window.innerWidth - 270) + 'px'
  popover.style.display = 'block'
  $('wt-editor-done')!.onclick = () => {
    popover.style.display = 'none'
    renderWordList(($('search-input') as HTMLInputElement)?.value || '')
  }
}

document.addEventListener('click', e => {
  const p = $('wt-editor-popover')
  if (p && p.style.display !== 'none' && !p.contains(e.target as Node) && !(e.target as HTMLElement).classList.contains('wt-add-btn')) {
    p.style.display = 'none'
    renderWordList(($('search-input') as HTMLInputElement)?.value || '')
  }
})

export function initWordlistListeners(): void {
  buildWordTypeSelector('word-type-selector', () => selectedType, setSelectedType)
  const zhInp = $('inp-zh') as HTMLInputElement | null
  if (zhInp) {
    zhInp.addEventListener('input', () => {
      const v = zhInp.value
      ;($('pinyin-preview') as HTMLElement).textContent = getPinyin(v) || ''
      lookupDict(v)
    })
  }
  $('add-word-btn')?.addEventListener('click', addWord)
  ;($('inp-vi') as HTMLInputElement | null)?.addEventListener('keydown', e => { if (e.key === 'Enter') addWord() })
  ;($('edit-inp-zh') as HTMLInputElement | null)?.addEventListener('input', () => {
    const v = ($('edit-inp-zh') as HTMLInputElement).value
    ;($('edit-pinyin-preview') as HTMLElement).textContent = getPinyin(v) || ''
  })
  $('edit-save-btn')?.addEventListener('click', saveWordEdit)
  $('edit-cancel-btn')?.addEventListener('click', () => { $('word-edit-overlay')!.style.display = 'none' })
  $('edit-close-btn')?.addEventListener('click', () => { $('word-edit-overlay')!.style.display = 'none' })
  $('word-edit-overlay')?.addEventListener('click', e => { if (e.target === $('word-edit-overlay')) $('word-edit-overlay')!.style.display = 'none' })
  ;($('search-input') as HTMLInputElement | null)?.addEventListener('input', e => renderWordList((e.target as HTMLInputElement).value))
}
