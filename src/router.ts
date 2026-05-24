import { hskState, tbState } from './state'

export const VALID_PAGES = ['dashboard', 'review', 'add', 'wordlist', 'articles', 'hsk-books', 'textbooks']

type PageAction = () => void
const registry = new Map<string, PageAction>()

export function registerPage(page: string, action: PageAction): void {
  registry.set(page, action)
}

export function nav(page: string, pushState = true): void {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById(page)?.classList.add('active')
  const navEl = document.getElementById(`nav-${page}`)
  if (navEl) navEl.classList.add('active')
  if (['upload-article', 'read-article', 'article-review'].includes(page)) {
    document.getElementById('nav-articles')?.classList.add('active')
  }
  if (page !== 'hsk-books') {
    hskState.view = 'books'; hskState.bookId = null; hskState.unitIndex = null; hskState.wordIndex = null
  }
  if (page !== 'textbooks') {
    tbState.view = 'levels'; tbState.level = null; tbState.bookId = null; tbState.bookData = null
    tbState.booksCache = {}; tbState.bookTab = 'articles'; tbState.articleId = null
    tbState.articleData = null; tbState.tbPinyinMode = false
  }
  registry.get(page)?.()
  if (pushState) history.pushState({ page }, '', `/${page}`)
}

export function navWordlistFilter(f: string): void {
  import('./state').then(({ setWordFilter }) => setWordFilter(f))
  nav('wordlist')
}

window.addEventListener('popstate', e => {
  const page = (e.state as any)?.page || 'dashboard'
  if (VALID_PAGES.includes(page)) nav(page, false)
})
