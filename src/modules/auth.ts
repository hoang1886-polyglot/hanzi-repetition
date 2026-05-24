import * as OpenCC from 'opencc-js'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, provider } from '../firebase'
import {
  db, currentArticleId, currentCard,
  setCurrentUserId, setDbDoc, setIsTraditional, setOpenccConverter,
  isTraditional, resetDb,
} from '../state'
import { $, toast } from '../utils'
import { initDbDoc, init } from '../sync'
import { nav, navWordlistFilter } from '../router'
import { renderDashboard } from './dashboard'
import { renderWordList } from './wordlist'
import { seedWords } from './wordlist'
import { renderReviewCard, renderArtReviewCard } from './review'
import { renderArticlesList, renderArticleBody, renderArticleAddedWords } from './articles'

// ─── Dark mode ────────────────────────────────────────────────────────────────
export function initDarkMode(): void {
  if (localStorage.getItem('hanzi_dark') === '1') document.body.classList.add('dark')
  $('dark-toggle')?.addEventListener('click', () => {
    document.body.classList.toggle('dark')
    localStorage.setItem('hanzi_dark', document.body.classList.contains('dark') ? '1' : '0')
  })
}

// ─── Traditional Chinese toggle ───────────────────────────────────────────────
async function getConverter(): Promise<(t: string) => string> {
  const { _openccConverter: conv } = await import('../state')
  if (conv) return conv
  const c = (OpenCC as any).Converter({ from: 'cn', to: 'twp' }) as (t: string) => string
  setOpenccConverter(c)
  return c
}

export async function initTradToggle(): Promise<void> {
  setIsTraditional(localStorage.getItem('hanzi_trad') === '1')
  const btn = $('trad-toggle')
  if (!btn) return
  if (isTraditional) { document.body.classList.add('trad'); await getConverter() }
  btn.addEventListener('click', async () => {
    const { isTraditional: cur, setIsTraditional: set } = await import('../state')
    set(!cur)
    const { isTraditional: next } = await import('../state')
    localStorage.setItem('hanzi_trad', next ? '1' : '0')
    document.body.classList.toggle('trad', next)
    if (next) await getConverter()
    const ap = document.querySelector('.page.active')?.id
    if (ap === 'wordlist') renderWordList()
    if (ap === 'dashboard') renderDashboard()
    if (ap === 'review') { const { currentCard: cc } = await import('../state'); if (cc) renderReviewCard() }
    if (ap === 'article-review') renderArtReviewCard()
    if (ap === 'read-article') {
      const { currentArticleId: cid } = await import('../state')
      if (cid != null) {
        const article = db.articles.find(a => a.id === cid)
        if (article) { renderArticleBody(article); renderArticleAddedWords(article) }
      }
    }
    if (ap === 'articles') renderArticlesList()
  })
}

// ─── Mobile menu ──────────────────────────────────────────────────────────────
export function initMobileMenu(): void {
  const btn     = $('menu-btn')
  const sidebar = document.getElementById('sidebar')
  const overlay = $('sidebar-overlay')
  if (!btn || !sidebar || !overlay) return
  btn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open') })
  overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open') })
  sidebar.querySelectorAll('.nav-item').forEach(item =>
    item.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open') })
  )
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export function initAuth(): void {
  document.getElementById('google-signin-btn')?.addEventListener('click', async () => {
    const errEl = document.getElementById('login-err')
    if (errEl) errEl.textContent = ''
    try { await signInWithPopup(auth, provider) }
    catch (e: any) { if (errEl) errEl.textContent = 'Đăng nhập thất bại: ' + (e.message || e.code || 'Lỗi không xác định') }
  })
  document.getElementById('signout-btn')?.addEventListener('click', async () => { await signOut(auth) })

  onAuthStateChanged(auth, async user => {
    const loginScreen  = document.getElementById('login-screen')
    const loadingScreen = document.getElementById('loading')
    const userRow      = document.getElementById('user-row')
    if (user) {
      if (loginScreen) loginScreen.style.display = 'none'
      const nameEl  = document.getElementById('user-name')
      const emailEl = document.getElementById('user-email')
      const wrap    = document.getElementById('user-avatar-wrap')
      if (nameEl)  nameEl.textContent  = user.displayName || 'Người dùng'
      if (emailEl) emailEl.textContent = user.email || ''
      if (wrap) {
        wrap.innerHTML = user.photoURL
          ? `<img class="user-avatar" src="${user.photoURL}" referrerpolicy="no-referrer">`
          : `<div class="user-avatar-fallback">${(user.displayName || '?')[0].toUpperCase()}</div>`
      }
      if (userRow) userRow.style.display = 'flex'
      setCurrentUserId(user.uid)
      initDbDoc(user.uid)
      resetDb()
      const { listenersReady, setListenersReady } = await import('../state')
      await init(
        startPage => {
          if (!listenersReady) { setupListeners(); setListenersReady(true) }
          nav(startPage, false)
        },
        renderDashboard,
        renderWordList,
        seedWords,
      )
    } else {
      setCurrentUserId(null)
      setDbDoc(null)
      resetDb()
      if (loadingScreen) loadingScreen.style.display = 'none'
      if (userRow) userRow.style.display = 'none'
      if (loginScreen) loginScreen.style.display = 'flex'
    }
  })

  // Safety timeout
  setTimeout(() => {
    const loading    = document.getElementById('loading')
    const loginScreen = document.getElementById('login-screen')
    if (loading && loading.style.display !== 'none') {
      loading.style.display = 'none'
      import('../state').then(({ currentUserId: uid }) => {
        if (!uid && loginScreen) loginScreen.style.display = 'flex'
      })
      console.warn('Firebase safety timeout fired')
    }
  }, 8000)
}

function setupListeners(): void {
  // Nav items
  ;['dashboard', 'review', 'add', 'wordlist', 'articles'].forEach(p => {
    document.getElementById(`nav-${p}`)?.addEventListener('click', () => nav(p))
  })
  // Delegated to individual module inits
  import('./wordlist').then(m => m.initWordlistListeners())
  import('./articles').then(m => m.initArticleListeners())
  import('./hsk').then(m => m.initHskNav())
  import('./hsk').then(m => m.initHskAddModal())
  import('./textbooks').then(m => m.initTbNav())

  // Dashboard stat cards → filtered wordlist
  document.getElementById('card-all')?.addEventListener('click', () => navWordlistFilter('all'))
  document.getElementById('card-due')?.addEventListener('click', () => navWordlistFilter('due'))
  document.getElementById('card-learned')?.addEventListener('click', () => navWordlistFilter('learned'))
  document.getElementById('card-mastered')?.addEventListener('click', () => navWordlistFilter('mastered'))
  document.getElementById('due-banner')?.addEventListener('click', () => nav('review'))
  document.getElementById('view-all-link')?.addEventListener('click', () => nav('wordlist'))

  // Rich toolbar for article upload
  const rtEditor  = $('article-body-inp')
  const rtToolbar = $('article-rich-toolbar')
  if (rtToolbar && rtEditor) {
    rtToolbar.querySelectorAll('.rtb-btn').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault()
        const cmd = (btn as HTMLElement).dataset.cmd!
        const val = (btn as HTMLElement).dataset.val || null
        document.execCommand(cmd, false, val)
        updateToolbarState(rtToolbar as HTMLElement)
        rtEditor.focus()
      })
    })
    function updateToolbarState(toolbar: HTMLElement) {
      toolbar.querySelectorAll('.rtb-btn').forEach(btn => {
        const cmd = (btn as HTMLElement).dataset.cmd!
        if (['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].includes(cmd)) {
          btn.classList.toggle('active', document.queryCommandState(cmd))
        }
      })
    }
    rtEditor.addEventListener('keyup',        () => updateToolbarState(rtToolbar as HTMLElement))
    rtEditor.addEventListener('mouseup',      () => updateToolbarState(rtToolbar as HTMLElement))
    rtEditor.addEventListener('selectionchange', () => updateToolbarState(rtToolbar as HTMLElement))
    rtEditor.addEventListener('paste', e => {
      e.preventDefault()
      const text = (e as ClipboardEvent).clipboardData?.getData('text/plain') || ''
      document.execCommand('insertHTML', false, text.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>'))
    })
  }
}
