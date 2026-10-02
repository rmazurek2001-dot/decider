import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, FolderOpen, Settings, HelpCircle, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import LanguageSwitcher from './LanguageSwitcher'

interface AppShellProps {
  children: ReactNode
}

const AppShell = ({ children }: AppShellProps) => {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = [
    { icon: LayoutGrid, label: 'Dashboard', path: '/', id: 'dashboard' },
    { icon: FolderOpen, label: 'Projects', path: '/projects', id: 'projects' },
    { icon: Settings, label: 'Settings', path: '/settings', id: 'settings' },
    { icon: HelpCircle, label: 'Help', path: '/help', id: 'help' },
  ]

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <motion.aside
        initial={{ x: -80, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-20 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-6 shadow-xl"
      >
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mb-8 cursor-pointer shadow-lg"
          onClick={() => navigate('/')}
        >
          <span className="text-white font-bold text-lg">AI</span>
        </motion.div>

        <nav className="flex-1 flex flex-col gap-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)

            return (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(item.path)}
                className={`relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 group ${
                  active
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title={item.label}
              >
                <Icon className="w-6 h-6" />

                <div className="absolute left-16 bg-slate-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  {item.label}
                </div>

                {active && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute -right-3 w-1 h-8 bg-indigo-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </motion.button>
            )
          })}
        </nav>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all duration-200 group"
          title="Logout"
        >
          <LogOut className="w-6 h-6" />
          <div className="absolute left-16 bg-slate-800 text-white text-xs font-medium px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            Logout
          </div>
        </motion.button>
      </motion.aside>

      <main className="flex-1 overflow-auto relative">
        <div className="absolute top-20 right-6 z-50">
          <LanguageSwitcher />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}

export default AppShell
