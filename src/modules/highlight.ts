import { db, currentArticleId } from '../state'
import { $, tr, getPinyin } from '../utils'
import { HIGHLIGHT_COLORS } from '../constants'
import { save } from '../sync'
import { lookupForPopup } from '../dict'
import { addWordFromArticle } from './wordlist'
import { renderArticleAddedWords, renderArticleBody } from './articles'
import { analyzeGrammar } from './grammar'
import type { FreeHighlight } from '../types'

export function applyWordHighlight(html: string, zh: string): string {
  if (!zh) return html
  const escaped = zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(new RegExp(`(?<!<[^>]*)${escaped}(?![^<]*>)`, 'g'), match => `<span class="word-highlight" title="${zh}">${match}</span>`)
}

export function applyFreeHighlight(html: string, h: FreeHighlight): string {
  if (!h || !h.text) return html
  const escaped = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const ci = HIGHLIGHT_COLORS.find(c => c.key === h.color) || HIGHLIGHT_COLORS[0]
  return html.replace(
    new RegExp(`(?<!<[^>]*)${escaped}(?![^<]*>)`, 'g'),
    match => `<span class="free-highlight" data-hkey="${encodeURIComponent(h.text)}" style="background:${ci.bg};color:${ci.text};border-radius:3px;padding:0 2px">${match}</span>`,
  )
}

export function highlightWord(zh: string): void {
  const body = $('article-reader-body')
  if (!body || !zh) return
  body.innerHTML = applyWordHighlight(body.innerHTML, tr(zh))
}

export function applyAndSaveFreeHighlight(text: string, color: string): void {
  const article = db.articles.find(a => a.id === currentArticleId)
  if (!article) return
  if (!article.freeHighlights) article.freeHighlights = []
  article.freeHighlights = article.freeHighlights.filter(h => h.text !== text)
  article.freeHighlights.push({ text, color })
  save()
  const bd = $('article-reader-body')!
  bd.innerHTML = applyFreeHighlight(bd.innerHTML, { text, color })
}

export function removeFreeHighlight(text: string): void {
  const article = db.articles.find(a => a.id === currentArticleId)
  if (!article) return
  article.freeHighlights = (article.freeHighlights || []).filter(h => h.text !== text)
  save()
  import('../state').then(({ currentArticleId: id }) => {
    if (id != null) {
      import('./articles').then(m => m.openArticle(id))
    }
  })
}

export function positionPopup(el: HTMLElement, rect: DOMRect): void {
  el.style.visibility = 'hidden'; el.style.display = 'block'
  const pH = el.offsetHeight || 220, pW = el.offsetWidth || 300, margin = 10
  const spaceAbove = rect.top, spaceBelow = window.innerHeight - rect.bottom
  let top: number
  if (spaceAbove >= pH + margin) top = rect.top + window.scrollY - pH - margin
  else if (spaceBelow >= pH + margin) top = rect.bottom + window.scrollY + margin
  else top = spaceAbove > spaceBelow ? Math.max(window.scrollY + margin, rect.top + window.scrollY - pH - margin) : rect.bottom + window.scrollY + margin
  el.style.left = Math.min(Math.max(margin, rect.left + window.scrollX), window.innerWidth - pW - margin) + 'px'
  el.style.top  = top + 'px'; el.style.visibility = ''
}

export function setupTextSelection(isTbMode = false): void {
  const bodyId    = isTbMode ? 'tb-art-reader-body' : 'article-reader-body'
  const pageId    = isTbMode ? 'textbooks'           : 'read-article'
  const body      = $(bodyId)
  const choicePopup = $('selection-choice-popup')!
  const popup       = $('selection-popup')!
  const hlPopup     = $('highlight-popup')!
  if (!body) return

  ;($('choice-highlight-btn') as HTMLElement).style.display = isTbMode ? 'none' : ''

  const newBody = body.cloneNode(true)
  body.parentNode!.replaceChild(newBody, body)
  const bd = $(bodyId)!

  let savedText = '', savedRect: DOMRect | null = null

  document.addEventListener('mouseup', e => {
    if (!document.getElementById(pageId)?.classList.contains('active')) return
    if (choicePopup.contains(e.target as Node) || popup.contains(e.target as Node) || hlPopup.contains(e.target as Node)) return
    const sel  = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || !bd.contains(sel?.anchorNode as Node)) {
      choicePopup.style.display = 'none'; popup.style.display = 'none'; hlPopup.style.display = 'none'
      return
    }
    savedText = text
    savedRect = sel!.getRangeAt(0).getBoundingClientRect()
    ;($('choice-selected-text') as HTMLElement).textContent = `"${text.slice(0, 30)}${text.length > 30 ? '…' : ''}"`
    positionPopup(choicePopup as HTMLElement, savedRect)
    choicePopup.style.display = 'block'; popup.style.display = 'none'; hlPopup.style.display = 'none'
  })

  $('choice-cancel-btn')!.onclick = () => {
    choicePopup.style.display = 'none'
    window.getSelection()?.removeAllRanges()
  }

  $('choice-add-word-btn')!.onclick = () => {
    if (!savedText) return
    choicePopup.style.display = 'none'
    ;($('popup-word') as HTMLElement).textContent = savedText
    ;($('popup-pinyin') as HTMLElement).textContent = getPinyin(savedText)
    ;($('popup-vi-inp')    as HTMLInputElement).value = ''
    ;($('popup-zh-def-inp') as HTMLInputElement | null && ($('popup-zh-def-inp') as HTMLInputElement)).value || null
    if ($('popup-zh-def-inp')) ($('popup-zh-def-inp') as HTMLInputElement).value = ''
    ;($('popup-ex-zh-inp') as HTMLInputElement).value = ''
    ;($('popup-ex-vi-inp') as HTMLInputElement).value = ''
    import('../state').then(({ setPopupSelectedType }) => setPopupSelectedType(''))
    import('../utils').then(({ resetWordTypeSelector, buildWordTypeSelector }) => {
      import('../state').then(({ popupSelectedType, setPopupSelectedType }) => {
        resetWordTypeSelector('popup-word-type-selector', setPopupSelectedType)
        buildWordTypeSelector('popup-word-type-selector', () => popupSelectedType, setPopupSelectedType)
      })
    })
    lookupForPopup(savedText, val => { ($('popup-vi-inp') as HTMLInputElement).value = val })
    positionPopup(popup as HTMLElement, savedRect!)
    popup.style.display = 'block'
    setTimeout(() => ($('popup-vi-inp') as HTMLInputElement | null)?.focus(), 50)
  }

  $('choice-highlight-btn')!.onclick = () => {
    if (!savedText) return
    choicePopup.style.display = 'none'
    ;($('hlpopup-text') as HTMLElement).textContent = `"${savedText.slice(0, 28)}${savedText.length > 28 ? '…' : ''}"`
    ;(hlPopup as HTMLElement).dataset.text = savedText
    positionPopup(hlPopup as HTMLElement, savedRect!)
    hlPopup.style.display = 'block'
    window.getSelection()?.removeAllRanges()
  }

  $('choice-grammar-btn')!.onclick = () => {
    if (!savedText) return
    choicePopup.style.display = 'none'
    window.getSelection()?.removeAllRanges()
    analyzeGrammar(savedText)
  }

  document.getElementById('highlight-popup')!.querySelectorAll('.hl-color-btn').forEach(btn => {
    (btn as HTMLElement).onclick = () => {
      const text = (hlPopup as HTMLElement).dataset.text
      if (!text) return
      if (!isTbMode) applyAndSaveFreeHighlight(text, (btn as HTMLElement).dataset.color!)
      hlPopup.style.display = 'none'
      window.getSelection()?.removeAllRanges()
    }
  })
  $('hlpopup-cancel')!.onclick = () => { hlPopup.style.display = 'none'; window.getSelection()?.removeAllRanges() }
  $('hlpopup-remove')!.onclick = () => {
    const text = (hlPopup as HTMLElement).dataset.text
    if (!text) return
    if (!isTbMode) removeFreeHighlight(text)
    hlPopup.style.display = 'none'; window.getSelection()?.removeAllRanges()
  }

  $('popup-cancel-btn')!.onclick = () => { popup.style.display = 'none'; window.getSelection()?.removeAllRanges() }
  $('popup-add-btn')!.onclick = async () => {
    const zh = ($('popup-word') as HTMLElement).textContent?.trim() || ''
    const vi = ($('popup-vi-inp') as HTMLInputElement).value.trim()
    const zhDef = ($('popup-zh-def-inp') as HTMLInputElement | null)?.value.trim() || ''
    const exZh  = ($('popup-ex-zh-inp') as HTMLInputElement).value.trim()
    const exVi  = ($('popup-ex-vi-inp') as HTMLInputElement).value.trim()
    const note  = ($('popup-note-inp') as HTMLTextAreaElement | null)?.value.trim() || ''
    const { popupSelectedType } = await import('../state')
    const { currentArticleId: aid } = await import('../state')
    const w = addWordFromArticle(zh, vi, exZh, exVi, zhDef, popupSelectedType, note, aid ?? undefined)
    if (w) {
      if (!isTbMode) {
        highlightWord(zh)
        const article = db.articles.find(a => a.id === aid)
        if (article) renderArticleAddedWords(article)
      }
      toast(`✓ Đã thêm: ${zh}`); popup.style.display = 'none'; window.getSelection()?.removeAllRanges()
    } else {
      toast('Vui lòng nhập nghĩa!')
    }
  }
  ;($('popup-vi-inp') as HTMLInputElement).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const d = $('popup-zh-def-inp')
      d ? (d as HTMLInputElement).focus() : ($('popup-ex-zh-inp') as HTMLInputElement).focus()
    }
  })
  ;($('popup-zh-def-inp') as HTMLInputElement | null)?.addEventListener('keydown', e => { if (e.key === 'Enter') ($('popup-ex-zh-inp') as HTMLInputElement).focus() })
  ;($('popup-ex-zh-inp') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') ($('popup-ex-vi-inp') as HTMLInputElement).focus() })
  ;($('popup-ex-vi-inp') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') $('popup-add-btn')!.click() })
}
