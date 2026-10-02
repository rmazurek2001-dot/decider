import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, DollarSign, ChevronDown } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const LanguageSwitcher = () => {
  const { language, setLanguage, currency, setCurrency } = useLanguage()
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false)

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'pl' : 'en')
  }

  const currencies = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'PLN', symbol: 'zł', name: 'Polski Złoty' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
  ] as const

  return (
    <div className="flex items-center gap-2">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={toggleLanguage}
        className="flex items-center gap-2 px-3 py-2 bg-white/80 hover:bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-slate-700 font-medium text-sm"
        title={`Switch to ${language === 'en' ? 'Polski' : 'English'}`}
      >
        <Globe className="w-4 h-4" />
        <span className="uppercase font-bold">{language}</span>
      </motion.button>

      <div className="relative">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
          className="flex items-center gap-2 px-3 py-2 bg-white/80 hover:bg-white rounded-lg shadow-sm hover:shadow-md transition-all text-slate-700 font-medium text-sm"
          title="Change currency"
        >
          <DollarSign className="w-4 h-4" />
          <span className="font-bold">{currency}</span>
          <ChevronDown className="w-3 h-3" />
        </motion.button>

        <AnimatePresence>
          {showCurrencyMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCurrencyMenu(false)}
              />
              
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50"
              >
                {currencies.map((curr) => (
                  <button
                    key={curr.code}
                    onClick={() => {
                      setCurrency(curr.code)
                      setShowCurrencyMenu(false)
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-slate-50 transition-colors flex items-center justify-between ${
                      currency === curr.code ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{curr.symbol}</span>
                      <span className="text-sm">{curr.name}</span>
                    </span>
                    {currency === curr.code && (
                      <span className="text-indigo-600">✓</span>
                    )}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default LanguageSwitcher
