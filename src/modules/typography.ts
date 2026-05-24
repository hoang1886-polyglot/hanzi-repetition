// ─── Typography / Reader font settings ───────────────────────────────────────
// Persists font-family and font-size for article + textbook readers via
// localStorage. Exposed as a floating panel triggered by the "Aa" buttons.

const FONT_OPTIONS = [
  {
    key:    'serif',
    label:  'Noto Serif SC',
    sub:    'Thanh lịch, dễ đọc',
    sample: '字',
    css:    "'Noto Serif SC','Noto Sans SC',serif",
  },
  {
    key:    'sans',
    label:  'Noto Sans SC',
    sub:    'Hiện đại, gọn gàng',
    sample: '字',
    css:    "'Noto Sans SC',sans-serif",
  },
  {
    key:    'beviet',
    label:  'Be Vietnam Pro',
    sub:    'Phong cách, dễ đọc phần tiếng Việt',
    sample: 'Aa',
    css:    "'Be Vietnam Pro','Noto Sans SC',sans-serif",
  },
]

const SIZE_MIN     = 13
const SIZE_MAX     = 28
const SIZE_DEFAULT = 17
const READER_BODY_IDS = ['article-reader-body', 'tb-art-reader-body']

// ── Persistence ───────────────────────────────────────────────────────────────
export function getReaderFont(): string { return localStorage.getItem('reader_font') || 'serif' }
export function getReaderSize(): number {
  const v = localStorage.getItem('reader_size')
  return v ? Number(v) : SIZE_DEFAULT
}

// ── Apply ─────────────────────────────────────────────────────────────────────
export function applyTypography(): void {
  const font = FONT_OPTIONS.find(f => f.key === getReaderFont()) || FONT_OPTIONS[0]
  const size = getReaderSize()
  const lh   = size <= 16 ? '1.85' : size <= 20 ? '1.95' : '2.1'
  READER_BODY_IDS.forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.style.fontFamily = font.css
    el.style.fontSize   = size + 'px'
    el.style.lineHeight = lh
  })
}

// ── Panel rendering ───────────────────────────────────────────────────────────
function renderPanel(): void {
  const font = getReaderFont()
  const size = getReaderSize()

  const lbl = document.getElementById('typo-size-label')
  if (lbl) lbl.textContent = size + 'px'

  const dn = document.getElementById('typo-size-down') as HTMLButtonElement | null
  const up = document.getElementById('typo-size-up')   as HTMLButtonElement | null
  if (dn) dn.disabled = size <= SIZE_MIN
  if (up) up.disabled = size >= SIZE_MAX

  const sel = document.getElementById('typo-font-selector')
  if (!sel) return
  sel.innerHTML = FONT_OPTIONS.map(f => `
    <button class="typo-font-btn${f.key === font ? ' active' : ''}" data-font="${f.key}">
      <span>
        <span class="typo-font-name">${f.label}</span>
        <span style="display:block;font-size:10px;color:var(--text3);font-family:'DM Sans',sans-serif;font-weight:400;margin-top:1px">${f.sub}</span>
      </span>
      <span class="typo-font-sample" style="font-family:${f.css}">${f.sample}</span>
    </button>`).join('')

  sel.querySelectorAll('.typo-font-btn').forEach(btn => {
    (btn as HTMLElement).addEventListener('click', () => {
      localStorage.setItem('reader_font', (btn as HTMLElement).dataset.font!)
      renderPanel()
      applyTypography()
    })
  })
}

// ── Panel open / close ────────────────────────────────────────────────────────
let _anchor: Element | null = null

function openPanel(anchor: Element): void {
  const panel = document.getElementById('reader-typography-panel') as HTMLElement | null
  if (!panel) return
  renderPanel()
  panel.style.display = 'block'

  // Position below the anchor button, right-aligned
  const rect = anchor.getBoundingClientRect()
  const pW   = 264
  let   left = Math.max(8, rect.right + window.scrollX - pW)
  let   top  = rect.bottom + window.scrollY + 8
  // Flip above if not enough room below
  if (rect.bottom + 260 > window.innerHeight) top = rect.top + window.scrollY - panel.offsetHeight - 8

  panel.style.left = left + 'px'
  panel.style.top  = top  + 'px'
  _anchor = anchor

  // Mark button as open
  ;(anchor as HTMLElement).classList.add('open')
}

function closePanel(): void {
  const panel = document.getElementById('reader-typography-panel') as HTMLElement | null
  if (panel) panel.style.display = 'none'
  if (_anchor) (_anchor as HTMLElement).classList.remove('open')
  _anchor = null
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initTypographyBtns(): void {
  applyTypography()

  // Toggle buttons (article reader + textbook reader)
  ;['reader-font-btn', 'tb-reader-font-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      e.stopPropagation()
      const panel = document.getElementById('reader-typography-panel') as HTMLElement | null
      if (panel?.style.display !== 'none' && _anchor === e.currentTarget) {
        closePanel()
      } else {
        openPanel(e.currentTarget as Element)
      }
    })
  })

  // Size controls
  document.getElementById('typo-size-down')?.addEventListener('click', () => {
    const s = getReaderSize()
    if (s > SIZE_MIN) { localStorage.setItem('reader_size', String(s - 1)); renderPanel(); applyTypography() }
  })
  document.getElementById('typo-size-up')?.addEventListener('click', () => {
    const s = getReaderSize()
    if (s < SIZE_MAX) { localStorage.setItem('reader_size', String(s + 1)); renderPanel(); applyTypography() }
  })

  // Close on outside click
  document.addEventListener('click', e => {
    const panel = document.getElementById('reader-typography-panel') as HTMLElement | null
    if (!panel || panel.style.display === 'none') return
    if (!panel.contains(e.target as Node) && !(e.target as Element).closest('.reader-font-btn')) {
      closePanel()
    }
  })
}
