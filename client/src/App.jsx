import { useState } from 'react'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState([])
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')

  const handleSearch = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessType, location })
      });
      const data = await response.json();
      console.log(data);
      if (response.ok) {
        setSearchResults(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Business Type:</label>
        <input 
          type="text" 
          value={businessType} 
          onChange={(e) => setBusinessType(e.target.value)} 
          style={{ padding: '0.5rem', width: '250px' }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Location:</label>
        <input 
          type="text" 
          value={location} 
          onChange={(e) => setLocation(e.target.value)} 
          style={{ padding: '0.5rem', width: '250px' }}
        />
      </div>

      <button onClick={handleSearch} style={{ padding: '0.5rem 1rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
        Search
      </button>

      <div>Results: {searchResults.length}</div>
      {Array.isArray(searchResults) &&
        searchResults.map((business, index) => (
          <div key={index}>{business.name}</div>
        ))
      }
    </div>
  )
}

export default App
