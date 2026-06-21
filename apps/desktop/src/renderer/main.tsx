import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthSessionProvider } from './features/user/AuthSessionProvider'
import { MuiProvider } from './theme/MuiProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MuiProvider>
      <AuthSessionProvider>
        <App />
      </AuthSessionProvider>
    </MuiProvider>
  </StrictMode>,
)
