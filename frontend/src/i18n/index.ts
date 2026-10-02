import { en } from './en'
import { pl } from './pl'

export type Language = 'en' | 'pl'

export const translations = {
  en,
  pl,
}

export const languageNames = {
  en: 'English',
  pl: 'Polski',
}

export * from './en'
export * from './pl'
