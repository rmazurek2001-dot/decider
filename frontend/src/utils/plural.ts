export type PluralCategory = 'one' | 'few' | 'many'

export const pluralCategory = (count: number, language: string): PluralCategory => {
  if (count === 1) return 'one'
  if (language !== 'pl') return 'many'
  const lastDigit = count % 10
  const lastTwoDigits = count % 100
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return 'few'
  return 'many'
}
