import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted, never fetched from a font CDN (D129). Four @font-face rules -
// Latin and Devanagari, 400 and 700 - in one small stylesheet of our own; see it
// for why the packages' own stylesheets (22 faces each side) are not imported.
import './fonts.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
