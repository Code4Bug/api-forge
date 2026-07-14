import { Navigate, Route, Routes } from 'react-router-dom'
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout'
import EnvironmentPage from '@/pages/EnvironmentPage'
import HistoryPage from '@/pages/HistoryPage'
import HttpDebugPage from '@/pages/HttpDebugPage'
import SocketPage from '@/pages/SocketPage'
import WebSocketPage from '@/pages/WebSocketPage'
import SettingsPage from '@/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<WorkspaceLayout />}>
        <Route path="/" element={<Navigate to="/http" replace />} />
        <Route path="/http" element={<HttpDebugPage />} />
        <Route path="/websocket" element={<WebSocketPage />} />
        <Route path="/socket" element={<SocketPage />} />
        <Route path="/environments" element={<EnvironmentPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/http" replace />} />
      </Route>
    </Routes>
  )
}
