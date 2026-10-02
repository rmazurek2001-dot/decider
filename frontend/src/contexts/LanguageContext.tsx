import { createContext, useContext, useState, ReactNode } from 'react'
import { Language, translations, TranslationKeys } from '../i18n'

type Currency = 'USD' | 'PLN' | 'EUR' | 'GBP'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  currency: Currency
  setCurrency: (currency: Currency) => void
  t: TranslationKeys
  formatCurrency: (amount: number | string) => string
}

const currencySymbols: Record<Currency, string> = {
  USD: '$',
  PLN: 'zł',
  EUR: '€',
  GBP: '£',
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language')
    return (saved as Language) || 'en'
  })

  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = localStorage.getItem('currency')
    if (saved && ['USD', 'PLN', 'EUR', 'GBP'].includes(saved)) {
      return saved as Currency
    }
    return language === 'pl' ? 'PLN' : 'USD'
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
    
    const manualCurrency = localStorage.getItem('currency-manual')
    if (!manualCurrency) {
      const newCurrency = lang === 'pl' ? 'PLN' : 'USD'
      setCurrencyState(newCurrency)
      localStorage.setItem('currency', newCurrency)
    }
  }

  const setCurrency = (curr: Currency) => {
    setCurrencyState(curr)
    localStorage.setItem('currency', curr)
    localStorage.setItem('currency-manual', 'true')
  }

  const formatCurrency = (amount: number | string): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    const symbol = currencySymbols[currency]
    
    if (currency === 'PLN') {
      return `${num.toLocaleString('pl-PL')} ${symbol}`
    } else if (currency === 'EUR') {
      return `${symbol}${num.toLocaleString('de-DE')}`
    } else if (currency === 'GBP') {
      return `${symbol}${num.toLocaleString('en-GB')}`
    } else {
      return `${symbol}${num.toLocaleString('en-US')}`
    }
  }

  const t = translations[language]

  return (
    <LanguageContext.Provider value={{ language, setLanguage, currency, setCurrency, t, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
