import { pinyin } from 'pinyin-pro'
import { WORD_TYPES } from './constants'
import type { WordTypeInfo } from './types'
import { isTraditional, _openccConverter } from './state'

export function getPinyin(zh: string): string {
  try {
    return pinyin(zh, { toneType: 'symbol', type: 'string', separator: ' ' })
  } catch {
    return ''
  }
}

export function toast(msg: string): void {
  const t = document.createElement('div')
  t.className = 'toast'
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2400)
}

export function $(id: string): HTMLElement | null {
  return document.getElementById(id)
}

export function tr(text: string): string {
  if (!text || !isTraditional || !_openccConverter) return text
  return _openccConverter(text)
}

export function getWtInfo(key: string): WordTypeInfo | null {
  return WORD_TYPES.find(t => t.key === key) || null
}

export function wordTypeBadgeHtml(wordType: string | undefined, wordTypes: string[] | undefined): string {
  const types = wordTypes?.length ? wordTypes : (wordType ? [wordType] : [])
  if (!types.length) return ''
  return types.map(k => {
    const t = getWtInfo(k)
    if (!t) return ''
    return `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600;background:${t.bg};color:${t.color};margin-top:8px;border:1px solid ${t.color}33">
      <span style="font-size:13px">${t.key}</span><span style="opacity:0.7;font-size:11px">${t.vi}</span>
    </div>`
  }).join('')
}

export function buildWordTypeSelector(
  containerId: string,
  getSelected: () => string,
  setSelected: (v: string) => void,
  onSelect?: (v: string) => void,
): void {
  const container = $(containerId)
  if (!container) return
  container.innerHTML = WORD_TYPES.map(t => `
    <button class="wtype-tag${getSelected() === t.key ? ' active' : ''}" data-key="${t.key}"
      style="--wt-color:${t.color};--wt-bg:${t.bg}" title="${t.vi}">
      ${t.key} <span class="wtype-vi">${t.vi}</span>
    </button>`).join('')
  container.querySelectorAll('.wtype-tag').forEach(btn => {
    (btn as HTMLElement).addEventListener('click', () => {
      const k = (btn as HTMLElement).dataset.key!
      if (getSelected() === k) {
        setSelected('')
        btn.classList.remove('active')
      } else {
        container.querySelectorAll('.wtype-tag').forEach(b => b.classList.remove('active'))
        setSelected(k)
        btn.classList.add('active')
      }
      onSelect?.(getSelected())
    })
  })
}

export function resetWordTypeSelector(containerId: string, setSelected: (v: string) => void): void {
  setSelected('')
  const c = $(containerId)
  if (c) c.querySelectorAll('.wtype-tag').forEach(b => b.classList.remove('active'))
}

export function buildMultiTypeSelector(
  containerId: string,
  getSelected: () => string[],
  setSelected: (v: string[]) => void,
): void {
  const c = $(containerId)
  if (!c) return
  c.innerHTML = WORD_TYPES.map(t =>
    `<button class="wtype-tag${getSelected().includes(t.key) ? ' active' : ''}" data-key="${t.key}"
      style="--wt-color:${t.color};--wt-bg:${t.bg}">${t.key}<span class="wtype-vi"> ${t.vi}</span></button>`
  ).join('')
  c.querySelectorAll('.wtype-tag').forEach(btn => {
    (btn as HTMLElement).addEventListener('click', () => {
      const k = (btn as HTMLElement).dataset.key!
      const cur = getSelected()
      setSelected(cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k])
      buildMultiTypeSelector(containerId, getSelected, setSelected)
    })
  })
}

export function applyRubyAnnotations(el: HTMLElement): void {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n: Node) => (n.parentElement as HTMLElement).tagName === 'RT'
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT,
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  nodes.forEach(node => {
    const text = node.textContent || ''
    if (!/[一-鿿㐀-䶿]/.test(text)) return
    let pyArr: string[] = []
    try {
      pyArr = pinyin(text, { toneType: 'symbol', type: 'array', nonZh: 'removed' }) as string[]
    } catch { /* ignore */ }
    const frag = document.createDocumentFragment()
    let pi = 0
    for (const char of text) {
      if (/[一-鿿㐀-䶿]/.test(char)) {
        const ruby = document.createElement('ruby')
        ruby.appendChild(document.createTextNode(char))
        const rt = document.createElement('rt')
        rt.textContent = pyArr[pi++] || getPinyin(char)
        ruby.appendChild(rt)
        frag.appendChild(ruby)
      } else {
        frag.appendChild(document.createTextNode(char))
      }
    }
    node.parentNode!.replaceChild(frag, node)
  })
}
