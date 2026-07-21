import { useState } from 'react'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState([])
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch('http://localhost:5000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessType, location })
      });
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data);
      } else {
        setSearchError(data.error || 'Failed to search');
      }
    } catch (e) {
      setSearchError('Connection error: ' + e.message);
    } finally {
      setIsSearching(false);
    }
  };

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
      <h1>Lead Gen Development Build</h1>

      <div style={{ marginBottom: '2rem', width: '320px', border: '1px solid #444', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#1a1a1a', textAlign: 'left' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Business Type</label>
          <input 
            type="text" 
            value={businessType} 
            onChange={(e) => setBusinessType(e.target.value)} 
            placeholder="e.g. Plumbers, Dentists"
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', backgroundColor: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Location</label>
          <input 
            type="text" 
            value={location} 
            onChange={(e) => setLocation(e.target.value)} 
            placeholder="e.g. Bristol, London"
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', backgroundColor: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        <button 
          onClick={handleSearch} 
          disabled={isSearching}
          style={{ width: '100%', padding: '0.5rem', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        {searchError && (
          <p style={{ color: '#f87171', fontSize: '0.9rem', marginTop: '1rem', margin: 0 }}>{searchError}</p>
        )}
      </div>

      {searchResults.map((business, index) => (
        <div key={index} style={{ border: '1px solid #333', borderRadius: '4px', padding: '0.8rem', margin: '0.5rem 0', width: '320px', textAlign: 'left', backgroundColor: '#1a1a1a' }}>
          <div><strong>{business.name}</strong></div>
          {business.website && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: '#aaa' }}>
              Website: <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>{business.website}</a>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default App
