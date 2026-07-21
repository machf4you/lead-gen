import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState([])
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  useEffect(() => {
    // Automatically load default data on mount for testing
    const loadDefaultData = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ businessType: 'Plumbers', location: 'Bristol' })
        });
        const data = await response.json();
        if (response.ok) {
          setSearchResults(data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadDefaultData();
  }, []);

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
      console.log("RAW RESPONSE:", data);
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
      padding: '4rem 0 2rem 0',
      boxSizing: 'border-box',
      fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
      backgroundColor: '#121212',
      color: '#ffffff',
      textAlign: 'center',
      position: 'relative'
    }}>
      <div style={{
        backgroundColor: '#facc15',
        color: '#000000',
        width: '100%',
        padding: '0.75rem 0',
        fontWeight: 'bold',
        fontSize: '1.2rem',
        textAlign: 'center',
        position: 'absolute',
        top: 0,
        left: 0
      }}>
        TEST BANNER
      </div>

      <h1>Lead Gen Development Build</h1>

      <div style={{ marginBottom: '2rem', width: '320px', border: '1px solid #444', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#1a1a1a', textAlign: 'left' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Business Type:</label>
          <input 
            type="text" 
            value={businessType} 
            onChange={(e) => setBusinessType(e.target.value)} 
            placeholder="e.g. Plumbers, Dentists"
            style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', backgroundColor: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>Location:</label>
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

      <div>Length: {searchResults.length}</div>
      <div>First business: {searchResults[0]?.name ?? "NONE"}</div>

      {searchResults.map((business, index) => (
        <div key={index}>{business.name}</div>
      ))}
    </div>
  )
}

export default App
