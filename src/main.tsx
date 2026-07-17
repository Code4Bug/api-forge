import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './assets/css/global.css'
import './assets/css/ai.css'
import './assets/css/widgets.css'
import './assets/css/cursor-glow.css'
import './assets/css/brand.css'
import './assets/css/theme.css'
import './assets/css/base.css'
import './assets/css/slogan.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
