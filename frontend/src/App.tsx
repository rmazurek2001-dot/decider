import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import AppShell from './components/AppShell'
import ProjectDashboard from './components/ProjectDashboard'
import TreeVisualizer from './components/TreeVisualizer'
import SharedProjectView from './components/SharedProjectView'
import ObservabilityDashboard from './components/observability/ObservabilityDashboard'
import { LanguageProvider, useLanguage } from './contexts/LanguageContext'

function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { t } = useLanguage()

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl font-semibold text-slate-900 mb-2">{t.pages.projectNotFound}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t.pages.backToDashboard}
          </button>
        </div>
      </div>
    )
  }

  return <TreeVisualizer projectId={parseInt(projectId)} />
}

function PublicRoute() {
  const { token } = useParams<{ token: string }>()
  return (
    <ReactFlowProvider>
      <SharedProjectView token={token || ''} />
    </ReactFlowProvider>
  )
}

function DashboardLayout() {
  return (
    <AppShell>
      <ProjectDashboard />
    </AppShell>
  )
}

function ProjectLayout() {
  return (
    <AppShell>
      <ReactFlowProvider>
        <ProjectView />
      </ReactFlowProvider>
    </AppShell>
  )
}

function ObservabilityLayout() {
  return (
    <AppShell>
      <ObservabilityDashboard />
    </AppShell>
  )
}

function SettingsPage() {
  const { t } = useLanguage()
  return (
    <AppShell>
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">{t.nav.settings}</h1>
          <p className="text-slate-600">{t.pages.settingsComingSoon}</p>
        </div>
      </div>
    </AppShell>
  )
}

function HelpPage() {
  const { t } = useLanguage()
  return (
    <AppShell>
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">{t.pages.helpTitle}</h1>
          <p className="text-slate-600">{t.pages.helpComingSoon}</p>
        </div>
      </div>
    </AppShell>
  )
}

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DashboardLayout />} />
          <Route path="/projects" element={<DashboardLayout />} />
          <Route path="/project/:projectId" element={<ProjectLayout />} />
          <Route path="/observability" element={<ObservabilityLayout />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/share/:token" element={<PublicRoute />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
