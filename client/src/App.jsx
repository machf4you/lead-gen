import { useState } from 'react'
import './App.css'

function App() {
  const [healthStatus, setHealthStatus] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [submittedUrl, setSubmittedUrl] = useState(null)

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

  const handleSubmitUrl = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: urlInput })
      })
      if (response.ok) {
        const data = await response.json()
        setSubmittedUrl(data.url)
      }
    } catch (error) {
      console.error(error)
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

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '1rem', display: 'block', marginBottom: '0.5rem' }}>
          Website URL
        </label>
        <input 
          type="text" 
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://example.com"
          style={{
            padding: '0.5rem',
            fontSize: '1rem',
            borderRadius: '4px',
            border: '1px solid #444',
            backgroundColor: '#222',
            color: '#fff',
            width: '250px',
            textAlign: 'center'
          }}
        />
      </div>

      <button 
        onClick={handleSubmitUrl}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: 'pointer',
          marginBottom: '1rem',
          backgroundColor: '#10b981',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        Submit URL
      </button>

      {submittedUrl && (
        <p style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>
          Received: {submittedUrl}
        </p>
      )}

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



