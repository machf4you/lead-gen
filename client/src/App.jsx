import { useState } from 'react'
import './App.css'

function App() {
  const [healthStatus, setHealthStatus] = useState(null)

  const checkHealth = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/health')
      if (response.ok) {
        const data = await response.json()
        if (data.status === 'ok') {
          setHealthStatus('OK')
          return
        }
      }
      setHealthStatus('FAILED')
    } catch (error) {
      setHealthStatus('FAILED')
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
      backgroundColor: '#121212',
      color: '#ffffff',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: '700', marginBottom: '1rem' }}>
        Lead Gen - Development Build
      </h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
        Version: v0.1-clean-start
      </p>

      <button 
        onClick={checkHealth}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: 'pointer',
          marginBottom: '1rem',
          backgroundColor: '#2563eb',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        Health Check
      </button>

      {healthStatus && (
        <p style={{ fontSize: '1rem', marginBottom: '1rem' }}>
          Backend Status: {healthStatus}
        </p>
      )}

      <p style={{ color: '#888', fontSize: '1rem' }}>
        React/Vite Frontend & Node.js/Express Backend Initialized
      </p>
    </div>
  )
}

export default App


