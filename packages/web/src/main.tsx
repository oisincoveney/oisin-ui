import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppSidebar } from './components/app-sidebar'
import { Toaster } from './components/ui/sonner'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { startThreadStore } from './thread/thread-store'

startThreadStore()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <App />
      </SidebarInset>
      <Toaster position="bottom-right" />
    </SidebarProvider>
  </StrictMode>,
)
