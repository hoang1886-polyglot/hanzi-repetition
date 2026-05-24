import {
  db, currentArticleId, articleSortOrder, editingArticleId, pinyinMode,
  isTraditional, _openccConverter, artSelectedType,
  setCurrentArticleId, setArticleSortOrder, setEditingArticleId, setPinyinMode, setArtSelectedType,
} from '../state'
import { $, toast, tr, getPinyin, applyRubyAnnotations, buildWordTypeSelector, resetWordTypeSelector, getWtInfo } from '../utils'
import { save } from '../sync'
import { nav } from '../router'
import { artLookupDict } from '../dict'
import { applyWordHighlight, applyFreeHighlight, highlightWord, setupTextSelection } from './highlight'
import { addWordFromArticle } from './wordlist'
import { startArticleReview } from './review'
import type { Article } from '../types'

// ─── Articles list ─────────────────────────────────────────────────────────────
export function renderArticlesList(): void {
  const container = $('articles-list')!
  if (!db.articles || !db.articles.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">📰</div><h3>Chưa có bài báo nào</h3><p>Upload bài báo tiếng Trung để học từ mới từ ngữ cảnh thực tế!</p></div>`
    return
  }
  const sorted = [...db.articles].sort((a, b) => articleSortOrder === 'newest' ? b.added - a.added : a.added - b.added)
  container.innerHTML = sorted.map(a => `
    <div class="article-card" data-id="${a.id}">
      ${a.imageUrl ? `<img class="article-card-img" src="${a.imageUrl}" alt="" onerror="this.style.display='none'">` : ''}
      <div style="flex:1;min-width:0">
        <div class="article-card-title">${a.title}</div>
        <div class="article-card-meta">${a.source ? '📰 ' + a.source + ' · ' : ''}${new Date(a.added).toLocaleDateString('vi-VN')} · ${a.wordCount || 0} ký tự · ${a.addedWords || 0} từ đã học</div>
        <div class="article-card-preview">${(a.body || '').replace(/<[^>]*>/g, '').slice(0, 80)}...</div>
      </div>
      <div class="article-card-actions">
        <button class="article-edit-btn" data-edit="${a.id}" title="Chỉnh sửa">✏️</button>
        <button class="article-del-btn"  data-del="${a.id}"  title="Xoá">✕</button>
      </div>
    </div>`).join('')
  container.querySelectorAll('.article-card').forEach(card => {
    card.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('[data-del]') || (e.target as HTMLElement).closest('[data-edit]')) return
      openArticle(Number((card as HTMLElement).dataset.id))
    })
  })
  container.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); openEditArticle(Number((btn as HTMLElement).dataset.edit)) })
  )
  container.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation()
      if (!confirm('Xoá bài báo này?')) return
      db.articles = db.articles.filter(a => a.id !== Number((btn as HTMLElement).dataset.del))
      save(); renderArticlesList(); toast('Đã xoá bài báo.')
    })
  )
}

// ─── Save article ─────────────────────────────────────────────────────────────
export function saveArticle(): void {
  const title = ($('article-title-inp') as HTMLInputElement).value.trim()
  const body  = ($('article-body-inp') as HTMLElement).innerHTML.trim()
  if (!title || !body) { toast('Vui lòng nhập tiêu đề và nội dung!'); return }
  if (editingArticleId !== null) {
    const article = db.articles.find(a => a.id === editingArticleId)
    if (!article) { toast('Không tìm thấy!'); return }
    article.title    = title
    article.source   = ($('article-source-inp') as HTMLInputElement).value.trim()
    article.imageUrl = ($('article-image-inp') as HTMLInputElement).value.trim()
    article.body     = body
    article.wordCount = ($('article-body-inp') as HTMLElement).innerText.length
    article.editedAt  = Date.now()
    setEditingArticleId(null)
    save(); clearUploadForm(); toast(`✓ Đã cập nhật: ${title}`); nav('articles')
  } else {
    const article: Article = {
      id: Date.now(), title,
      source:   ($('article-source-inp') as HTMLInputElement).value.trim(),
      imageUrl: ($('article-image-inp') as HTMLInputElement).value.trim(),
      body, wordCount: ($('article-body-inp') as HTMLElement).innerText.length,
      addedWords: 0, added: Date.now(),
    }
    if (!db.articles) db.articles = []
    db.articles.push(article); save(); clearUploadForm(); toast(`✓ Đã lưu: ${title}`); nav('articles')
  }
}

export function clearUploadForm(): void {
  ;['article-title-inp','article-source-inp','article-image-inp'].forEach(id => {
    const el = $(id) as HTMLInputElement | null; if (el) el.value = ''
  })
  ;($('article-body-inp') as HTMLElement).innerHTML = ''
  ;($('article-image-preview') as HTMLElement).style.display = 'none'
  ;($('article-img-thumb') as HTMLImageElement).src = ''
  ;($('upload-article-heading') as HTMLElement).textContent = 'Upload bài báo'
  ;($('upload-article-subheading') as HTMLElement).textContent = 'Dán nội dung bài báo tiếng Trung vào đây'
  ;($('save-article-btn') as HTMLElement).textContent = '💾 Lưu bài báo'
  setEditingArticleId(null)
}

function openEditArticle(id: number): void {
  const article = db.articles.find(a => a.id === id); if (!article) return
  setEditingArticleId(id)
  ;($('article-title-inp')  as HTMLInputElement).value = article.title  || ''
  ;($('article-source-inp') as HTMLInputElement).value = article.source || ''
  ;($('article-image-inp')  as HTMLInputElement).value = article.imageUrl || ''
  ;($('article-body-inp')   as HTMLElement).innerHTML  = article.body   || ''
  if (article.imageUrl) {
    ;($('article-image-preview') as HTMLElement).style.display = 'block'
    ;($('article-img-thumb')     as HTMLImageElement).src = article.imageUrl
  } else {
    ;($('article-image-preview') as HTMLElement).style.display = 'none'
    ;($('article-img-thumb')     as HTMLImageElement).src = ''
  }
  ;($('upload-article-heading')    as HTMLElement).textContent = 'Chỉnh sửa bài báo'
  ;($('upload-article-subheading') as HTMLElement).textContent = 'Cập nhật nội dung bài báo'
  ;($('save-article-btn')          as HTMLElement).textContent = '💾 Lưu thay đổi'
  nav('upload-article')
}

// ─── Article body rendering ───────────────────────────────────────────────────
export function renderArticleBody(article: Article): void {
  let html = article.body || ''
  if (isTraditional && _openccConverter) html = _openccConverter(html)
  const linkedWords = db.words.filter(w => (article.linkedWords || []).includes(w.id))
  linkedWords.sort((a, b) => b.zh.length - a.zh.length)
  linkedWords.forEach(w => { html = applyWordHighlight(html, tr(w.zh)) })
  ;(article.freeHighlights || []).forEach(h => { html = applyFreeHighlight(html, h) })
  const bd = $('article-reader-body')!
  bd.innerHTML = html
  bd.classList.toggle('pinyin-on', pinyinMode)
  if (pinyinMode) applyRubyAnnotations(bd as HTMLElement)
}

export function renderArticleAddedWords(article: Article): void {
  const wordsDiv = $('article-added-words')!
  const ids = article.linkedWords || []
  if (!ids.length) { wordsDiv.textContent = 'Chưa có từ nào.'; return }
  const words = db.words.filter(w => ids.includes(w.id))
  wordsDiv.innerHTML = words.map(w => {
    const wt = w.wordType ? getWtInfo(w.wordType) : null
    return `<div class="added-word-row">
      <span class="added-word-zh">${tr(w.zh)}</span>
      <span class="added-word-py">${w.pinyin}</span>
      ${wt ? `<span style="padding:1px 7px;border-radius:99px;font-size:10px;font-weight:600;background:${wt.bg};color:${wt.color};flex-shrink:0">${wt.key}</span>` : ''}
      <span class="added-word-vi">${w.vi}</span>
    </div>`
  }).join('')
}

export function openArticle(id: number): void {
  const article = db.articles.find(a => a.id === id); if (!article) return
  setCurrentArticleId(id)
  ;($('read-article-title')  as HTMLElement).textContent = article.title
  ;($('read-article-source') as HTMLElement).textContent = article.source || ''
  let readerImgEl = document.getElementById('reader-article-img') as HTMLImageElement | null
  if (!readerImgEl) {
    readerImgEl = document.createElement('img')
    readerImgEl.id = 'reader-article-img'
    readerImgEl.style.cssText = 'width:100%;max-height:220px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:16px;border:1px solid var(--border)'
    const bd = $('article-reader-body')!
    bd.parentElement!.insertBefore(readerImgEl, bd.parentElement!.firstChild!.nextSibling)
  }
  if (article.imageUrl) {
    readerImgEl.src = article.imageUrl; readerImgEl.style.display = 'block'
    readerImgEl.onerror = () => { readerImgEl!.style.display = 'none' }
  } else {
    readerImgEl.style.display = 'none'; readerImgEl.src = ''
  }
  setPinyinMode(false)
  renderArticleBody(article)
  const ptb = $('pinyin-toggle-btn')
  if (ptb) {
    ptb.classList.remove('active')
    ptb.onclick = () => {
      const newMode = !pinyinMode
      setPinyinMode(newMode)
      ptb.classList.toggle('active', newMode)
      const a = db.articles.find(a => a.id === currentArticleId)
      if (a) renderArticleBody(a)
    }
  }
  // Highlight toggle: reset to ON each time an article is opened
  const artBody = $('article-reader-body')
  if (artBody) artBody.classList.remove('highlights-off')
  const htb = $('art-highlight-toggle-btn')
  if (htb) {
    htb.classList.add('active')
    htb.textContent = 'Ẩn highlight'
    htb.onclick = () => {
      const nowOn = htb.classList.toggle('active')
      htb.textContent = nowOn ? 'Ẩn highlight' : 'Hiện highlight'
      const bd = $('article-reader-body')
      if (bd) bd.classList.toggle('highlights-off', !nowOn)
    }
  }
  ;['art-inp-zh','art-inp-vi','art-inp-zh-def','art-inp-ex-zh','art-inp-ex-vi'].forEach(id => {
    const el = $(id) as HTMLInputElement | null; if (el) el.value = ''
  })
  ;($('art-pinyin-preview') as HTMLElement).textContent = ''
  setArtSelectedType('')
  buildWordTypeSelector('art-word-type-selector',
    () => artSelectedType,
    v => setArtSelectedType(v),
  )
  renderArticleAddedWords(article)
  nav('read-article')
  setupTextSelection(false)
}

// ─── Article listeners ────────────────────────────────────────────────────────
export function initArticleListeners(): void {
  $('go-upload-btn')?.addEventListener('click', () => nav('upload-article'))
  $('save-article-btn')?.addEventListener('click', saveArticle)
  $('cancel-upload-btn')?.addEventListener('click', () => { clearUploadForm(); nav('articles') })
  $('back-articles-btn')?.addEventListener('click', () => nav('articles'))
  $('sort-newest-btn')?.addEventListener('click', () => {
    setArticleSortOrder('newest')
    ;($('sort-newest-btn') as HTMLElement).classList.add('active')
    ;($('sort-oldest-btn') as HTMLElement).classList.remove('active')
    renderArticlesList()
  })
  $('sort-oldest-btn')?.addEventListener('click', () => {
    setArticleSortOrder('oldest')
    ;($('sort-oldest-btn') as HTMLElement).classList.add('active')
    ;($('sort-newest-btn') as HTMLElement).classList.remove('active')
    renderArticlesList()
  })
  $('article-image-inp')?.addEventListener('input', () => {
    const url     = ($('article-image-inp') as HTMLInputElement).value.trim()
    const preview = $('article-image-preview')!
    const thumb   = $('article-img-thumb') as HTMLImageElement
    if (url) { preview.style.display = 'block'; thumb.src = url }
    else     { preview.style.display = 'none';  thumb.src = '' }
  })
  $('art-inp-zh')?.addEventListener('input', () => {
    const v = ($('art-inp-zh') as HTMLInputElement).value.trim()
    ;($('art-pinyin-preview') as HTMLElement).textContent = getPinyin(v) || ''
    artLookupDict(v)
  })
  $('art-add-word-btn')?.addEventListener('click', async () => {
    const zh    = ($('art-inp-zh')     as HTMLInputElement).value.trim()
    const vi    = ($('art-inp-vi')     as HTMLInputElement).value.trim()
    const exZh  = ($('art-inp-ex-zh')  as HTMLInputElement).value.trim()
    const exVi  = ($('art-inp-ex-vi')  as HTMLInputElement).value.trim()
    const zhDef = ($('art-inp-zh-def') as HTMLInputElement).value.trim()
    const note  = ($('art-inp-note')   as HTMLTextAreaElement | null)?.value.trim() || ''
    const { artSelectedType, currentArticleId: aid } = await import('../state')
    const w = addWordFromArticle(zh, vi, exZh, exVi, zhDef, artSelectedType, note, aid ?? undefined)
    if (w) {
      ;['art-inp-zh','art-inp-vi','art-inp-ex-zh','art-inp-ex-vi','art-inp-zh-def','art-inp-note'].forEach(id => {
        const el = $(id) as HTMLInputElement | null; if (el) el.value = ''
      })
      ;($('art-pinyin-preview') as HTMLElement).textContent = ''
      import('../state').then(({ setArtSelectedType }) => setArtSelectedType(''))
      resetWordTypeSelector('art-word-type-selector', v => import('../state').then(({ setArtSelectedType }) => setArtSelectedType(v)))
      toast(`✓ Đã thêm: ${zh}`)
      if (aid != null) {
        const article = db.articles.find(a => a.id === aid)
        if (article) renderArticleAddedWords(article)
      }
      highlightWord(zh)
    }
  })
  $('art-review-back-btn')?.addEventListener('click', () => nav('read-article'))
  $('start-art-review-btn')?.addEventListener('click', () => startArticleReview())
}
