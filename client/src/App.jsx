import { useState, useEffect } from 'react'
import { createEmptyLead } from './models/Lead'
import './App.css'

function App() {
  const [healthStatus, setHealthStatus] = useState(null)
  const [urlInput, setUrlInput] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobs, setJobs] = useState([])
  const emptyLead = createEmptyLead()

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

  useEffect(() => {
    const interval = setInterval(() => {
      fetchJobs()
    }, 2000)
    return () => clearInterval(interval)
  }, [])

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
              {(job.status === 'Analysing' || job.status === 'Completed') && (
                <div style={{ marginTop: '0.5rem' }}>
                  {job.fetchResult && !job.fetchResult.success ? (
                    <p style={{ margin: '0.2rem 0', color: '#f87171' }}>Fetch Failed</p>
                  ) : job.fetchResult && job.fetchResult.success ? (
                    <>
                      <p style={{ margin: '0.2rem 0' }}>HTTP Status: {job.fetchResult.httpStatus}</p>
                      <p style={{ margin: '0.2rem 0' }}>Final URL: {job.fetchResult.finalUrl}</p>
                      <p style={{ margin: '0.2rem 0' }}>HTML Size: {job.fetchResult.htmlLength}</p>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}
      )}

      <div style={{
        marginTop: '2rem',
        marginBottom: '2rem',
        padding: '1.5rem',
        border: '1px solid #444',
        borderRadius: '8px',
        backgroundColor: '#1a1a1a',
        width: '320px',
        textAlign: 'left'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
          Lead Structure Verification
        </h3>
        <p style={{ margin: '0.4rem 0' }}><strong>Lead ID:</strong> {emptyLead.leadId || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Business Name:</strong> {emptyLead.businessName || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Business Type:</strong> {emptyLead.businessType || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Location:</strong> {emptyLead.location || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Website:</strong> {emptyLead.website || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Phone:</strong> {emptyLead.phone || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Email:</strong> {emptyLead.email || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Address:</strong> {emptyLead.address || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Opportunity Status:</strong> {emptyLead.opportunityStatus || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Opportunity Type:</strong> {emptyLead.opportunityType || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Opportunity Description:</strong> {emptyLead.opportunityDescription || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Email Status:</strong> {emptyLead.emailStatus || "(empty)"}</p>
        <p style={{ margin: '0.4rem 0' }}><strong>Created Date:</strong> {emptyLead.createdDate || "(empty)"}</p>
      </div>


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




