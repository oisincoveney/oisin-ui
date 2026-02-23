import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppSidebar } from './components/app-sidebar'
import { Toaster } from './components/ui/sonner'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { setActiveDiffThread, startDiffStore } from './diff/diff-store'
import {
  getActiveThreadDiffTarget,
  getThreadStoreSnapshot,
  startThreadStore,
  subscribeThreadStore,
} from './thread/thread-store'

startThreadStore()
startDiffStore()

setActiveDiffThread(getActiveThreadDiffTarget(getThreadStoreSnapshot()))
subscribeThreadStore(() => {
  setActiveDiffThread(getActiveThreadDiffTarget(getThreadStoreSnapshot()))
})

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
