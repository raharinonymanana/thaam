import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted, never fetched from a font CDN (D129). The combined files carry
// unicode-range, so the Devanagari woff2 is only downloaded once Hindi is
// actually on screen. 400 and 700 only - nothing here uses a third weight.
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-sans-devanagari/400.css'
import '@fontsource/noto-sans-devanagari/700.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
