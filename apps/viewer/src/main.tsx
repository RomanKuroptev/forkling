import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root.tsx'
import { touchUi } from './touch.ts'
import './styles.css'

// Lets the stylesheet switch on how the page is being used.
document.documentElement.dataset.input = touchUi ? 'touch' : 'pointer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
