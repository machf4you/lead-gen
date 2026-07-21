import { useState } from 'react'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState([])
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [selectedBusiness, setSelectedBusiness] = useState(null)

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

  const handleAnalyse = (business) => {
    console.log(business);
    setSelectedBusiness(business);
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

      {selectedBusiness && (
        <div style={{ margin: '1.5rem 0', padding: '1rem', border: '1px solid #444', borderRadius: '4px', textAlign: 'left', width: '320px', backgroundColor: '#1a1a1a' }}>
          <h3>Selected Business</h3>
          <div><strong>{selectedBusiness.name}</strong></div>
          {selectedBusiness.website && (
            <div>
              Website: <a href={selectedBusiness.website} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                {(() => {
                  try {
                    return new URL(selectedBusiness.website).hostname.replace(/^www\./, '');
                  } catch (e) {
                    return selectedBusiness.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
                  }
                })()}
              </a>
            </div>
          )}
          {selectedBusiness.phone && <div>Phone: {selectedBusiness.phone}</div>}
          {selectedBusiness.address && <div>Address: {selectedBusiness.address}</div>}
          {selectedBusiness.rating !== null && selectedBusiness.rating !== undefined && <div>Rating: {selectedBusiness.rating}</div>}
        </div>
      )}

      {Array.isArray(searchResults) &&
        searchResults.map((business, index) => {
          let domain = '';
          if (business.website) {
            try {
              domain = new URL(business.website).hostname.replace(/^www\./, '');
            } catch (e) {
              domain = business.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
            }
          }
          const isSelected = selectedBusiness && selectedBusiness.name === business.name && selectedBusiness.address === business.address;
          return (
            <div key={index} style={{ marginBottom: '1.5rem', textAlign: 'left', backgroundColor: isSelected ? '#1e293b' : 'transparent', padding: isSelected ? '0.5rem' : '0', borderRadius: '4px' }}>
              <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '1.5rem 0' }} />
              <div><strong>{business.name}</strong></div>
              {business.website && (
                <div>
                  Website: <a href={business.website} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>{domain}</a>
                </div>
              )}
              {business.phone && <div>Phone: {business.phone}</div>}
              {business.address && <div>Address: {business.address}</div>}
              {business.rating !== null && business.rating !== undefined && <div>Rating: {business.rating}</div>}
              <button onClick={() => handleAnalyse(business)} style={{ marginTop: '0.5rem', cursor: 'pointer' }}>
                Analyse
              </button>
            </div>
          );
        })
      }
    </div>
  )
}

export default App
