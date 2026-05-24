import { pinyin } from 'pinyin-pro'
import { WORD_TYPES } from './constants'
import type { WordTypeInfo } from './types'
import { isTraditional, _openccConverter } from './state'

// ── Tone sandhi helpers ───────────────────────────────────────────────────────
// Detect the tone number (1-4) from a pinyin string with tone symbols.
// Returns 0 for neutral/no-tone.
function getTone(py: string): 0 | 1 | 2 | 3 | 4 {
  if (/[āēīōūǖ]/.test(py)) return 1
  if (/[áéíóúǘ]/.test(py)) return 2
  if (/[ǎěǐǒǔǚ]/.test(py)) return 3
  if (/[àèìòùǜ]/.test(py)) return 4
  return 0
}

// Single-character degree adverbs that signal the 太X了/很X了 construction.
const DEGREE_CHARS = new Set(['太', '很', '挺', '真', '最', '蛮', '更', '越', '极'])

// Apply Mandarin tone-sandhi rules that pinyin-pro does not handle:
//
//  Rule 1 — 一 (yī) sandhi
//    • before tone-4 syllable  → yí (tone 2)
//    • before tone-1/2/3       → yì (tone 4)
//    • elsewhere (end of word, neutral next) → unchanged yī
//
//  Rule 2 — 了 (liǎo → le) in degree constructions
//    • Pattern: DEGREE_CHAR … 了 where 了 is the last Chinese char
//      in the current run (clause/sentence end).
//    • Looks back up to 4 positions for a degree char so it covers both
//      single-char adjectives (太早了) and two-char adjectives (很漂亮了).
function applyPinyinSandhi(zhChars: string[], pyArr: string[]): string[] {
  const out = [...pyArr]
  for (let i = 0; i < zhChars.length; i++) {
    // Rule 1: 一
    if (zhChars[i] === '一' && out[i] === 'yī') {
      const next = i + 1 < out.length ? getTone(out[i + 1]) : 0
      if (next === 4)              out[i] = 'yí'
      else if (next >= 1 && next <= 3) out[i] = 'yì'
    }
    // Rule 2: 了 at end of Chinese run, preceded by a degree word
    if (zhChars[i] === '了' && i === zhChars.length - 1) {
      for (let j = 1; j <= 4; j++) {
        if (i - j >= 0 && DEGREE_CHARS.has(zhChars[i - j])) {
          out[i] = 'le'
          break
        }
      }
    }
  }
  return out
}

const ZH_RE = /[一-鿿㐀-䶿]/

export function getPinyin(zh: string): string {
  try {
    const raw = pinyin(zh, { toneType: 'symbol', type: 'array', nonZh: 'removed' }) as string[]
    const chars = [...zh].filter(c => ZH_RE.test(c))
    return applyPinyinSandhi(chars, raw).join(' ')
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
      const raw = pinyin(text, { toneType: 'symbol', type: 'array', nonZh: 'removed' }) as string[]
      const zhChars = [...text].filter(c => ZH_RE.test(c))
      pyArr = applyPinyinSandhi(zhChars, raw)
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
