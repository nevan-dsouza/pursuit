import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/kanit/latin-700-italic.css'
import './styles.css'
import App from './App.tsx'
import { StoreProvider } from './store.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
