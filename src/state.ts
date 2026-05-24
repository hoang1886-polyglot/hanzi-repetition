import type { AppDb, HskState, TbState, Word } from './types'
import type { DocumentReference } from 'firebase/firestore'

export const db: AppDb = {
  words: [],
  sessions: {},
  correct: 0,
  total: 0,
  articles: [],
  memorized: [],
}

export let reviewQueue: Word[] = []
export let currentCard: Word | null = null
export let answered = false
export let saveTimer: ReturnType<typeof setTimeout> | null = null
export let pinyinMode = false
export let wordFilter = 'all'
export let lastSaveAt = 0
export let currentUserId: string | null = null
export let listenersReady = false
export let DB_DOC: DocumentReference | null = null

// Word type selection per context
export let selectedType = ''
export let artSelectedType = ''
export let popupSelectedType = ''
export let editSelectedTypes: string[] = []

// Traditional Chinese
export let isTraditional = false
export let _openccConverter: ((text: string) => string) | null = null

// Articles
export let currentArticleId: number | null = null
export let articleSortOrder: 'newest' | 'oldest' = 'newest'
export let editingArticleId: number | null = null

// Review session
export let reviewCorrect = 0
export let reviewTotal = 0
export let reviewInitial = 0
export let reviewWrong: Word[] = []

// Article review session
export let artReviewQueue: Word[] = []
export let artReviewCard: Word | null = null
export let artReviewAnswered = false
export let artReviewCorrect = 0
export let artReviewTotal = 0
export let artReviewInitial = 0

// HSK state
export const hskState: HskState = {
  view: 'books',
  bookId: null,
  unitIndex: null,
  wordIndex: null,
}

// Textbooks state
export const tbState: TbState = {
  view: 'levels',
  level: null,
  bookId: null,
  bookData: null,
  booksCache: {},
  bookTab: 'articles',
  articleId: null,
  articleData: null,
  tbPinyinMode: false,
  articlesCache: [],
  articlesCacheBookId: null,
}

// Setters (for values that can't be directly mutated from other modules due to primitive export)
export function setReviewQueue(q: Word[]) { reviewQueue = q }
export function setCurrentCard(c: Word | null) { currentCard = c }
export function setAnswered(v: boolean) { answered = v }
export function setSaveTimer(t: ReturnType<typeof setTimeout> | null) { saveTimer = t }
export function setPinyinMode(v: boolean) { pinyinMode = v }
export function setWordFilter(v: string) { wordFilter = v }
export function setLastSaveAt(v: number) { lastSaveAt = v }
export function setCurrentUserId(v: string | null) { currentUserId = v }
export function setListenersReady(v: boolean) { listenersReady = v }
export function setDbDoc(v: DocumentReference | null) { DB_DOC = v }
export function setSelectedType(v: string) { selectedType = v }
export function setArtSelectedType(v: string) { artSelectedType = v }
export function setPopupSelectedType(v: string) { popupSelectedType = v }
export function setEditSelectedTypes(v: string[]) { editSelectedTypes = v }
export function setIsTraditional(v: boolean) { isTraditional = v }
export function setOpenccConverter(v: ((t: string) => string) | null) { _openccConverter = v }
export function setCurrentArticleId(v: number | null) { currentArticleId = v }
export function setArticleSortOrder(v: 'newest' | 'oldest') { articleSortOrder = v }
export function setEditingArticleId(v: number | null) { editingArticleId = v }
export function setReviewStats(correct: number, total: number, initial: number, wrong: Word[]) {
  reviewCorrect = correct; reviewTotal = total; reviewInitial = initial; reviewWrong = wrong
}
export function setArtReviewQueue(q: Word[]) { artReviewQueue = q }
export function setArtReviewCard(c: Word | null) { artReviewCard = c }
export function setArtReviewAnswered(v: boolean) { artReviewAnswered = v }
export function setArtReviewStats(correct: number, total: number, initial: number) {
  artReviewCorrect = correct; artReviewTotal = total; artReviewInitial = initial
}

export function resetDb() {
  db.words = []; db.sessions = {}; db.correct = 0; db.total = 0; db.articles = []; db.memorized = []
}
