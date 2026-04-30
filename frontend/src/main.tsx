import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { initializeUiTheme } from '../hooks/use-ui-theme'
import '../styles/globals.css'
import './styles/mission-control.css'

initializeUiTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
