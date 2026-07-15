import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout'
import EnvironmentPage from '@/pages/EnvironmentPage'
import HistoryPage from '@/pages/HistoryPage'
import HttpDebugPage from '@/pages/HttpDebugPage'
import SocketPage from '@/pages/SocketPage'
import WebSocketPage from '@/pages/WebSocketPage'
import SettingsPage from '@/pages/SettingsPage'

function CursorMosaicGlow() {
  const glowRef = useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = useState(() => localStorage.getItem('cursorMosaicGlow') !== 'false')
  const target = useRef({ x: -240, y: -240 })
  const current = useRef({ x: -240, y: -240 })

  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem('cursorMosaicGlow') !== 'false')
    window.addEventListener('api-forge:cursor-glow-change', sync)
    return () => window.removeEventListener('api-forge:cursor-glow-change', sync)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let frame = 0
    const move = (event: MouseEvent) => {
      target.current = { x: event.clientX, y: event.clientY }
      if (glowRef.current) glowRef.current.dataset.visible = 'true'
    }
    const leave = () => {
      if (glowRef.current) glowRef.current.dataset.visible = 'false'
    }
    const animate = () => {
      current.current.x += (target.current.x - current.current.x) * 0.12
      current.current.y += (target.current.y - current.current.y) * 0.12
      if (glowRef.current) {
        glowRef.current.style.setProperty('--cursor-x', `${current.current.x}px`)
        glowRef.current.style.setProperty('--cursor-y', `${current.current.y}px`)
      }
      frame = window.requestAnimationFrame(animate)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseleave', leave)
    frame = window.requestAnimationFrame(animate)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseleave', leave)
      window.cancelAnimationFrame(frame)
    }
  }, [enabled])

  return enabled ? <div ref={glowRef} className="cursor-mosaic-glow" aria-hidden="true" /> : null
}

export default function App() {
  return (
    <>
      <CursorMosaicGlow />
      <Routes>
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<Navigate to="/http" replace />} />
          <Route path="/http" element={<HttpDebugPage />} />
          <Route path="/websocket" element={<WebSocketPage />} />
          <Route path="/socket" element={<SocketPage />} />
          <Route path="/environments" element={<EnvironmentPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/ai" element={null} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/http" replace />} />
        </Route>
      </Routes>
    </>
  )
}
