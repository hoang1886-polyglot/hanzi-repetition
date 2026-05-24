import { initDarkMode, initTradToggle, initMobileMenu, initAuth } from './modules/auth'
import { loadDict } from './dict'
import { registerPage } from './router'
import { renderDashboard } from './modules/dashboard'
import { renderWordList } from './modules/wordlist'
import { renderArticlesList } from './modules/articles'

registerPage('dashboard', renderDashboard)
registerPage('wordlist', () => renderWordList())
registerPage('articles', renderArticlesList)

loadDict()
initDarkMode()
initTradToggle()
initMobileMenu()
initAuth()
