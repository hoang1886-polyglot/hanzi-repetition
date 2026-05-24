import { $ } from './utils'

let dictData: Record<string, string> | null = null
let dictLoading = false

export function getDictData(): Record<string, string> | null { return dictData }

export async function loadDict(): Promise<void> {
  if (dictData || dictLoading) return
  dictLoading = true
  try {
    const res = await fetch('./cvdict.json')
    if (!res.ok) throw new Error()
    dictData = await res.json()
  } catch {
    dictData = {}
  }
  dictLoading = false
}

export function lookupDict(zh: string): void {
  const el = $('dict-result')
  if (!el) return
  if (!zh.trim()) { el.innerHTML = ''; return }
  if (!dictData) {
    el.innerHTML = '<span class="dict-searching">Đang tải từ điển...</span>'
    loadDict().then(() => {
      const inp = $('inp-zh') as HTMLInputElement | null
      if (inp) lookupDict(inp.value)
    })
    return
  }
  const found = dictData[zh]
  if (found) {
    el.innerHTML = `<div class="dict-chip" id="dict-chip"><span>${zh}</span><span class="dict-arrow">→</span><span class="dict-vi">${found}</span><span class="dict-apply">↙ Dùng</span></div>`
    $('dict-chip')?.addEventListener('click', () => {
      const vi = $('inp-vi') as HTMLInputElement | null
      if (vi) { vi.value = found; vi.focus() }
      el.innerHTML = '<span style="font-size:12px;color:var(--green)">✓ Đã điền nghĩa!</span>'
      setTimeout(() => { el.innerHTML = '' }, 1500)
    })
  } else {
    const chars = [...zh]
    if (chars.length > 1) {
      const r = chars.map(c => dictData![c] ? `${c}: ${dictData![c].split(';')[0]}` : null).filter(Boolean)
      el.innerHTML = r.length
        ? `<div class="dict-notfound">Từng chữ: <em>${r.join(' | ')}</em></div>`
        : '<span class="dict-notfound">Không tìm thấy</span>'
    } else {
      el.innerHTML = '<span class="dict-notfound">Không tìm thấy trong từ điển</span>'
    }
  }
}

export function artLookupDict(zh: string): void {
  const viInp = $('art-inp-vi') as HTMLInputElement | null
  if (!viInp) return
  if (!zh) { viInp.style.borderColor = ''; viInp.placeholder = 'e.g. kinh tế'; return }
  if (!dictData) { loadDict().then(() => { const el = $('art-inp-zh') as HTMLInputElement | null; if (el) artLookupDict(el.value.trim()) }); return }
  const found = dictData[zh]
  if (found) {
    if (!viInp.value.trim()) {
      viInp.value = found.split(';')[0].trim()
      viInp.style.borderColor = 'var(--green)'
      viInp.style.boxShadow = '0 0 0 3px rgba(23,122,71,0.12)'
      setTimeout(() => { viInp.style.borderColor = ''; viInp.style.boxShadow = '' }, 1800)
    }
  } else if (zh.length > 1) {
    const fc = dictData[[...zh][0]]
    if (fc) viInp.placeholder = '→ ' + fc.split(';')[0].trim() + '...'
  }
}

export function lookupForPopup(text: string, callback: (val: string) => void): void {
  if (dictData) {
    if (dictData[text]) callback(dictData[text].split(';')[0].trim())
  } else {
    loadDict().then(() => {
      if (dictData?.[text]) callback(dictData[text].split(';')[0].trim())
    })
  }
}

export function dictLookup(text: string, dict: Record<string, string>): string {
  return dict[text] || ''
}

export function getDictFull(): Record<string, string> { return dictData || {} }
