import { useState } from 'react'
import './App.css'

function App() {
  const [healthStatus, setHealthStatus] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobs, setJobs] = useState([])

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
        setJobId(data.jobId)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const fetchJobs = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/jobs')
      if (response.ok) {
        const data = await response.json()
        setJobs(data)
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
      minHeight: '100vh',
      padding: '2rem 0',
      boxSizing: 'border-box',
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

      {jobId && (
        <p style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>
          Job ID:<br />
          {jobId}
        </p>
      )}

      <button 
        onClick={fetchJobs}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: 'pointer',
          marginBottom: '1rem',
          backgroundColor: '#8b5cf6',
          color: '#ffffff',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        View Jobs
      </button>

      {jobs.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          {jobs.map((job) => (
            <div key={job.jobId} style={{ marginBottom: '1rem', padding: '0.5rem', borderBottom: '1px solid #333' }}>
              <p style={{ margin: '0.2rem 0' }}>Job ID: {job.jobId}</p>
              <p style={{ margin: '0.2rem 0' }}>URL: {job.url}</p>
              <p style={{ margin: '0.2rem 0' }}>Status: {job.status}</p>
            </div>
          ))}
        </div>
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

      <p style={{ color: '#888', fontSize: '1rem', marginTop: '1rem' }}>
        React/Vite Frontend & Node.js/Express Backend Initialized
      </p>
    </div>
  )
}

export default App




