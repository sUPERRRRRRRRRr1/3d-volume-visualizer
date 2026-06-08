import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Thai font (self-contained, bundled — no external network request)
import '@fontsource/sarabun/300.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/500.css'
import '@fontsource/sarabun/700.css'
// KaTeX styles for rendered math formulas
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
