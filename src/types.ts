export interface Word {
  id: number
  zh: string
  vi: string
  pinyin: string
  zhDef?: string
  exZh?: string
  exVi?: string
  note?: string
  wordType?: string
  wordTypes?: string[]
  status: 'new' | 'learning' | 'review' | 'mastered'
  ef: number
  interval: number
  repetitions: number
  nextReview: number | null
  lastReview: number | null
  added: number
}

export interface FreeHighlight {
  text: string
  color: string
}

export interface Block {
  type: 'text' | 'audio'
  content?: string
  url?: string
  label?: string
}

export interface Article {
  id: number
  title: string
  source?: string
  imageUrl?: string
  body: string
  wordCount?: number
  addedWords?: number
  added: number
  linkedWords?: number[]
  freeHighlights?: FreeHighlight[]
  editedAt?: number
  blocks?: Block[]
}

export interface AppDb {
  words: Word[]
  sessions: Record<string, number>
  correct: number
  total: number
  articles: Article[]
  memorized: number[]
}

export interface HskWord {
  zh: string
  vi: string
  hanViet?: string
  zhDef?: string
  memoryTip?: string
  exZh?: string
  exVi?: string
}

export interface HskUnit {
  title: string
  words: HskWord[]
}

export interface HskBook {
  id: string
  title: string
  level: number
  icon: string
  desc: string
  units: HskUnit[]
  dataUrl?: string
}

export interface WordTypeInfo {
  key: string
  vi: string
  color: string
  bg: string
}

export interface HighlightColor {
  key: string
  label: string
  bg: string
  text: string
  dot: string
}

export interface HskState {
  view: string
  bookId: string | null
  unitIndex: number | null
  wordIndex: number | null
}

export interface TbState {
  view: string
  level: number | null
  bookId: string | null
  bookData: any
  booksCache: Record<string, any>
  bookTab: string
  articleId: string | null
  articleData: any
  tbPinyinMode: boolean
}

export interface TbLevel {
  level: number
  label: string
  desc: string
  color: string
  grad: string
  icon: string
}
