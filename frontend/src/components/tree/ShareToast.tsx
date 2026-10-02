import { motion } from 'framer-motion'
import { useLanguage } from '../../contexts/LanguageContext'

const ShareToast = () => {
  const { t } = useLanguage()

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      role="status"
      className="fixed bottom-8 right-8 z-50 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/30"
    >
      <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <p className="font-semibold">{t.tree.linkCopied}</p>
        <p className="text-sm text-emerald-100">{t.tree.linkCopiedHint}</p>
      </div>
    </motion.div>
  )
}

export default ShareToast
