import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from 'reactflow'
import AppShell from './components/AppShell'
import ProjectDashboard from './components/ProjectDashboard'
import TreeVisualizer from './components/TreeVisualizer'
import SharedProjectView from './components/SharedProjectView'
import { LanguageProvider } from './contexts/LanguageContext'

function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-xl font-semibold text-slate-900 mb-2">Project not found</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard
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

function SettingsPage() {
  return (
    <AppShell>
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Settings</h1>
          <p className="text-slate-600">Settings page coming soon...</p>
        </div>
      </div>
    </AppShell>
  )
}

function HelpPage() {
  return (
    <AppShell>
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Help & Documentation</h1>
          <p className="text-slate-600">Help page coming soon...</p>
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
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/share/:token" element={<PublicRoute />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  )
}

export default App
