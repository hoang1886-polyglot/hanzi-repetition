import type { HskBook } from '../types'
// @ts-ignore
import hsk1Data from '../../data/hsk1.json'

export const HSK_BOOKS: HskBook[] = [
  hsk1Data as HskBook,
  {
    id: 'hsk2',
    title: 'HSK 2',
    level: 2,
    icon: '🌿',
    desc: 'Đang cập nhật...',
    units: [],
  },
  {
    id: 'hsk3',
    title: 'HSK 3',
    level: 3,
    icon: '🌳',
    desc: 'Đang cập nhật...',
    units: [],
  },
  {
    id: 'hsk4',
    title: 'HSK 4',
    level: 4,
    icon: '🔥',
    desc: 'Từ vựng HSK 4 — phiên bản 3.0',
    units: [],
  },
  {
    id: 'hsk5',
    title: 'HSK 5',
    level: 5,
    icon: '💎',
    desc: 'Đang cập nhật...',
    units: [],
  },
  {
    id: 'hsk6',
    title: 'HSK 6',
    level: 6,
    icon: '👑',
    desc: 'Đang cập nhật...',
    units: [],
  },
]
