import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)