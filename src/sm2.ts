import type { Word } from './types'

export function sm2(w: Word, g: number): void {
  let { ef = 2.5, interval = 0, repetitions = 0 } = w
  if (g === 0) { repetitions = 0; interval = 1 }
  else if (g === 1) { interval = Math.max(1, Math.round(interval * 1.2)); ef = Math.max(1.3, ef - 0.15) }
  else if (g === 2) {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 4 : Math.round(interval * ef)
    repetitions++
    ef = Math.max(1.3, ef - 0.08)
  } else {
    interval = repetitions === 0 ? 4 : Math.round(interval * ef * 1.3)
    repetitions++
    ef = Math.max(1.3, ef + 0.15)
  }
  w.ef = ef; w.interval = interval; w.repetitions = repetitions
  w.nextReview = Date.now() + interval * 864e5; w.lastReview = Date.now()
  w.status = repetitions >= 3 ? 'mastered' : repetitions >= 1 ? 'review' : 'learning'
}

export function sm2Local(w: any, g: number): void {
  let { ef = 2.5, interval = 0, repetitions = 0 } = w
  if (g === 0) { repetitions = 0; interval = 1 }
  else if (g === 1) { interval = Math.max(1, Math.round(interval * 1.2)); ef = Math.max(1.3, ef - 0.15) }
  else if (g === 2) {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 4 : Math.round(interval * ef)
    repetitions++
    ef = Math.max(1.3, ef - 0.08)
  } else {
    interval = repetitions === 0 ? 4 : Math.round(interval * ef * 1.3)
    repetitions++
    ef = Math.max(1.3, ef + 0.15)
  }
  w.ef = ef; w.interval = interval; w.repetitions = repetitions
  w._localNext = Date.now() + interval * 864e5
}

export function intLabel(g: number, w: Word): string {
  const { ef = 2.5, interval = 0, repetitions = 0 } = w
  if (g === 0) return '<10 phút'
  if (g === 1) return `${Math.max(1, Math.round(interval * 1.2))} ngày`
  if (g === 2) return repetitions === 0 ? '1 ngày' : repetitions === 1 ? '4 ngày' : `${Math.round(interval * ef)} ngày`
  return repetitions === 0 ? '4 ngày' : `${Math.round(interval * ef * 1.3)} ngày`
}
