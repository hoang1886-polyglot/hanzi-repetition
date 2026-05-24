import { initDarkMode, initTradToggle, initMobileMenu, initAuth } from './modules/auth'
import { loadDict } from './dict'
import { registerPage } from './router'
import { renderDashboard } from './modules/dashboard'
import { renderWordList } from './modules/wordlist'
import { renderArticlesList } from './modules/articles'
import { startReview } from './modules/review'
import { hskNav } from './modules/hsk'
import { tbNav } from './modules/textbooks'

registerPage('dashboard', renderDashboard)
registerPage('review', startReview)
registerPage('wordlist', () => renderWordList())
registerPage('articles', renderArticlesList)
registerPage('hsk-books', () => hskNav('books'))
registerPage('textbooks', () => tbNav('levels'))

loadDict()
initDarkMode()
initTradToggle()
initMobileMenu()
initAuth()
