import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { firestore } from './firebase'
import { db, currentUserId, lastSaveAt, saveTimer, DB_DOC, setLastSaveAt, setSaveTimer, setDbDoc } from './state'
import { $, toast } from './utils'

const syncBar  = () => document.getElementById('sync-bar')
const syncPill = () => document.getElementById('sync-pill')
const sdot     = () => document.getElementById('sdot')
const stext    = () => document.getElementById('stext')

export function setSyncing(): void {
  syncBar()!.className = 'syncing'
  sdot()!.className = 'sdot spin'
  stext()!.textContent = 'Đang đồng bộ...'
  syncPill()!.className = 'show'
}
export function setSynced(): void {
  syncBar()!.className = 'synced'
  sdot()!.className = 'sdot green'
  stext()!.textContent = 'Đã đồng bộ ✓'
  setTimeout(() => { syncPill()!.className = ''; syncBar()!.className = '' }, 2000)
}
export function setSyncErr(): void {
  const s = sdot()!
  s.className = 'sdot'
  s.style.background = 'var(--red)'
  stext()!.textContent = 'Lỗi kết nối ⚠'
  syncPill()!.className = 'show'
}

export function save(): void {
  try { localStorage.setItem('hanzi_bk_' + (currentUserId || 'anon'), JSON.stringify(db)) } catch { /* ignore */ }
  setLastSaveAt(Date.now())
  if (saveTimer) clearTimeout(saveTimer)
  const t = setTimeout(async () => {
    setSyncing()
    try {
      await setDoc(DB_DOC!, JSON.parse(JSON.stringify(db)))
      setSynced()
    } catch {
      setSyncErr()
      toast('⚠️ Lỗi đồng bộ.')
    }
    setSaveTimer(null)
  }, 600)
  setSaveTimer(t)
}

export async function init(
  onReady: (startPage: string) => void,
  renderDashboard: () => void,
  renderWordList: () => void,
  seedWords: () => void,
): Promise<void> {
  const bk = localStorage.getItem('hanzi_bk_' + (currentUserId || 'anon'))
  if (bk) { try { Object.assign(db, JSON.parse(bk)) } catch { /* ignore */ } }

  try {
    const snap = await Promise.race([
      getDoc(DB_DOC!),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('firebase_timeout')), 6000)),
    ])
    if (snap.exists()) {
      const d = snap.data() as any
      db.words    = d.words    || []
      db.sessions = d.sessions || {}
      db.correct  = d.correct  || 0
      db.total    = d.total    || 0
      db.articles = d.articles || []
      db.memorized = d.memorized || []
    } else {
      if (!bk) seedWords()
      await setDoc(DB_DOC!, JSON.parse(JSON.stringify(db)))
    }
  } catch (e: any) {
    if (e.message === 'firebase_timeout') {
      toast('⚠️ Firebase phản hồi chậm. Đang dùng dữ liệu cục bộ.')
    } else {
      if (!bk) seedWords()
      toast('⚠️ Không kết nối Firebase. Dùng dữ liệu cục bộ.')
    }
  }

  $('loading')!.style.display = 'none'

  const urlPage = location.pathname.replace(/\//g, '') || 'dashboard'
  const VALID_PAGES = ['dashboard', 'review', 'add', 'wordlist', 'articles', 'hsk-books', 'textbooks']
  const startPage = VALID_PAGES.includes(urlPage) ? urlPage : 'dashboard'
  history.replaceState({ page: startPage }, '', `/${startPage}`)
  onReady(startPage)

  onSnapshot(DB_DOC!, snap => {
    if (!snap.exists()) return
    if (Date.now() - lastSaveAt < 5000) return
    const d = snap.data() as any
    db.words    = d.words    || []
    db.sessions = d.sessions || {}
    db.correct  = d.correct  || 0
    db.total    = d.total    || 0
    db.articles = d.articles || []
    db.memorized = d.memorized || []
    try { localStorage.setItem('hanzi_bk_' + (currentUserId || 'anon'), JSON.stringify(db)) } catch { /* ignore */ }
    const ap = document.querySelector('.page.active')?.id
    if (ap === 'dashboard') renderDashboard()
    if (ap === 'wordlist') renderWordList()
  }, err => console.warn('Snapshot error:', err))
}

export function initDbDoc(uid: string): void {
  setDbDoc(doc(firestore, 'users', uid, 'data', 'main'))
}
