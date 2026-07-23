import { useState, useEffect } from 'react'
import './App.css'

// Helper to construct a natural UK English Contact Strategy summary (2-4 sentences)
const getContactStrategySummary = (item) => {
  const keyword = item.searchKeyword || 'your services';
  const location = item.location || '';
  const phrase = location ? `${keyword} in ${location}` : keyword;
  const rank = parseInt(item.rank, 10);
  const health = item.seoHealth;
  const gbp = item.gbp;

  let reasons = [];
  if (health) {
    if (!health.isHttps) reasons.push("critical security issues (missing HTTPS)");
    if (!health.indexable) reasons.push("technical indexability blocks");
    if (!health.titlePresent || !health.descriptionPresent || !health.h1Present) reasons.push("missing page title or meta tags");
  }
  if (gbp && gbp.status === 'Not Found') {
    reasons.push("a missing Google Business Profile");
  }

  let summary = '';
  const positionText = (!isNaN(rank) && rank > 0) ? `currently ranking at position #${rank} for "${phrase}"` : `ranking in search results for "${phrase}"`;
  
  if (reasons.length > 0) {
    summary = `This business is an exceptional prospect ${positionText}. While they have established some search visibility, their growth is severely restricted by ${reasons.slice(0, 2).join(' and ')}. Resolving these high-impact visibility gaps represents an immediate opportunity to capture more local enquiries.`;
  } else {
    summary = `This business is a strong candidate for expansion ${positionText}. Since their basic technical SEO tags are optimized, they are prime for advanced local campaigns. Building high-intent local landing pages and boosting reviews represents their most immediate commercial growth path.`;
  }
  return summary;
};

// Helper to list key talking points based solely on analysis findings
const getKeyTalkingPoints = (item) => {
  const points = [];
  const health = item.seoHealth;
  const gbp = item.gbp;

  if (health) {
    if (!health.isHttps) {
      points.push("Missing HTTPS encryption (non-secure)");
    }
    if (health.statusCode !== 200) {
      points.push(`Critical response status code issue (${health.statusCode || 'Error'})`);
    }
    if (!health.indexable) {
      points.push("Technical indexing issues (page flagged as noindex)");
    }
    if (!health.hasCanonical) {
      points.push("Missing canonical URL tag");
    }
    if (!health.titlePresent) {
      points.push("Missing Meta Title tag");
    } else if (health.titleLength < 40 || health.titleLength > 70) {
      points.push("Sub-optimal Meta Title length");
    }
    if (!health.descriptionPresent) {
      points.push("Missing Meta Description tag");
    } else if (health.descriptionLength < 100 || health.descriptionLength > 160) {
      points.push("Missing or sub-optimal Meta Description");
    }
    if (!health.h1Present) {
      points.push("Missing primary H1 Heading tag");
    } else if (health.h1Count > 1) {
      points.push("Multiple H1 headings (confuses search engines)");
    }
  }

  if (gbp) {
    if (gbp.status === 'Not Found') {
      points.push("Weak Google Business Profile (missing listing)");
    } else if (gbp.status === 'Multiple Matches') {
      points.push("Conflicting Google Business Profile listings");
    } else if (gbp.status === 'Found') {
      const rating = parseFloat(gbp.rating);
      const reviews = parseInt(gbp.reviewCount, 10);
      if (!isNaN(rating) && rating < 4.0) {
        points.push(`Weak Google Business Profile rating (${rating}★)`);
      }
      if (!isNaN(reviews) && reviews < 30) {
        points.push(`Weak Google Business Profile (low review count: ${reviews})`);
      }
    }
  }

  if (points.length === 0) {
    points.push("Quick SEO wins available");
  }

  return points;
};

// Helper to generate a conversational, personalised first-contact email
const generateFirstEmail = (item) => {
  const keyword = item.searchKeyword || 'your services';
  const location = item.location || '';
  const phrase = location ? `${keyword} in ${location}` : keyword;
  const domain = item.domain || 'your website';
  const gbp = item.gbp;
  const health = item.seoHealth;

  let issuesText = '';
  const list = [];
  if (health) {
    if (!health.isHttps) {
      list.push("your homepage currently loads as non-secure (HTTP)");
    }
    if (!health.titlePresent) {
      list.push("the page title is missing");
    }
    if (!health.descriptionPresent) {
      list.push("there is no meta description appearing in search results");
    }
    if (!health.h1Present) {
      list.push("the primary H1 heading tag is missing");
    }
  }
  if (gbp && gbp.status === 'Not Found') {
    list.push("your business is missing its Google Business Profile listing");
  }

  if (list.length > 0) {
    issuesText = `I noticed ${list.slice(0, 2).join(' and ')}. These elements are quite important for search engine rankings, but luckily they are straightforward to resolve.`;
  } else {
    issuesText = `I noticed a few easy wins to capture more local customers, like setting up dedicated landing pages and local search schemas.`;
  }

  const subject = `Quick question about visibility for ${domain}`;
  
  const email = `Subject: ${subject}

Hi there,

I was looking for local businesses online and came across ${domain} ranking at position #${item.rank || 'N/A'} for "${phrase}" in Google. 

You have a fantastic business, but while reviewing the listing, ${issuesText}

Resolving these search gaps will make it much easier for new clients to find you and click through to your site instead of your competitors.

I've put together a brief, 2-minute checklist detailing the exact steps to optimize this. Would it be alright to send it over?

Kind regards,

[Your Name]
[Your Company]`;

  return email;
};

function App() {
  const [searchResults, setSearchResults] = useState([])
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [currentView, setCurrentView] = useState('search')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchMode, setSearchMode] = useState('organic')
  const [excludedDomains, setExcludedDomains] = useState(() => {
    try {
      const saved = localStorage.getItem('tse_excluded_domains');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  const [activeAnalysisItem, setActiveAnalysisItem] = useState(null)
  const [activeSearchId, setActiveSearchId] = useState(null)
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBulkAnalysing, setIsBulkAnalysing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState(null)
  const [outreachEmail, setOutreachEmail] = useState('')
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [milestones, setMilestones] = useState([])
  const [isMilestonesLoading, setIsMilestonesLoading] = useState(false)
  const [milestonesError, setMilestonesError] = useState(null)
  const [expandedMilestones, setExpandedMilestones] = useState({})
  const [newVersion, setNewVersion] = useState('')
  const [newSummary, setNewSummary] = useState('')
  const [newFeatures, setNewFeatures] = useState('')
  const [newBugfixes, setNewBugfixes] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newRollback, setNewRollback] = useState('')
  const [isCreatingMilestone, setIsCreatingMilestone] = useState(false)
  const [milestoneCreateError, setMilestoneCreateError] = useState(null)
  const [milestoneCreateSuccess, setMilestoneCreateSuccess] = useState(false)

  useEffect(() => {
    if (activeAnalysisItem) {
      setOutreachEmail(generateFirstEmail(activeAnalysisItem));
    } else {
      setOutreachEmail('');
    }
  }, [activeAnalysisItem]);

  const fetchMilestones = async () => {
    setIsMilestonesLoading(true);
    setMilestonesError(null);
    try {
      const response = await fetch('http://localhost:5000/api/milestones');
      if (!response.ok) throw new Error('Failed to load milestones');
      const data = await response.json();
      setMilestones(data);
    } catch (e) {
      console.error(e);
      setMilestonesError(e.message);
    } finally {
      setIsMilestonesLoading(false);
    }
  };

  useEffect(() => {
    fetchMilestones();
  }, []);

  const handleCreateMilestone = async (e) => {
    e.preventDefault();
    if (!newVersion || !newSummary) {
      setMilestoneCreateError('Version and summary are required.');
      return;
    }
    
    setIsCreatingMilestone(true);
    setMilestoneCreateError(null);
    setMilestoneCreateSuccess(false);

    try {
      const response = await fetch('http://localhost:5000/api/milestones/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version: newVersion.trim(),
          summary: newSummary.trim(),
          features: newFeatures.split('\n').map(s => s.trim()).filter(Boolean),
          bugfixes: newBugfixes.split('\n').map(s => s.trim()).filter(Boolean),
          notes: newNotes.trim(),
          rollback: newRollback.trim(),
          walkthroughPath: 'C:/Users/Admin/.gemini/antigravity/brain/373b4a05-e079-4b24-ab38-048b52cabd29/walkthrough.md'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create milestone');
      }

      setMilestoneCreateSuccess(true);
      setNewVersion('');
      setNewSummary('');
      setNewFeatures('');
      setNewBugfixes('');
      setNewNotes('');
      setNewRollback('');
      await fetchMilestones();
    } catch (e) {
      console.error(e);
      setMilestoneCreateError(e.message);
    } finally {
      setIsCreatingMilestone(false);
    }
  };

  const toggleMilestoneExpanded = (version) => {
    setExpandedMilestones(prev => ({
      ...prev,
      [version]: !prev[version]
    }));
  };
  const [recentAnalyses, setRecentAnalyses] = useState(() => {
    try {
      const saved = localStorage.getItem('tse_recent_analyses');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  const [analysisNotes, setAnalysisNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('tse_analysis_notes');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error(e);
      return {};
    }
  });

  const handleNoteChange = (urlOrDomain, value) => {
    setAnalysisNotes(prev => {
      const updated = { ...prev, [urlOrDomain]: value };
      localStorage.setItem('tse_analysis_notes', JSON.stringify(updated));
      return updated;
    });
  };
  
  const [savedSearches, setSavedSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('tse_saved_searches');
      let searches = saved ? JSON.parse(saved) : [];
      let modified = false;
      let currentIdNum = 1;
      
      // First pass: find max existing ID number
      for (let i = searches.length - 1; i >= 0; i--) {
        if (searches[i].searchId) {
          const match = searches[i].searchId.match(/SR(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= currentIdNum) {
              currentIdNum = num + 1;
            }
          }
        }
      }
      
      // Second pass: assign IDs and search types to those that lack them (oldest to newest)
      for (let i = searches.length - 1; i >= 0; i--) {
        if (!searches[i].searchId) {
          const idStr = `SR${String(currentIdNum).padStart(4, '0')}`;
          searches[i].searchId = idStr;
          currentIdNum++;
          modified = true;
        }
        if (!searches[i].searchType) {
          searches[i].searchType = searches[i].searchMode === 'organic' ? 'Organic' : 'GMB';
          modified = true;
        }
      }
      
      if (modified) {
        localStorage.setItem('tse_saved_searches', JSON.stringify(searches));
      }
      return searches;
    } catch (e) {
      console.error(e);
      return [];
    }
  });

  const getDomain = (url) => {
    if (!url) return '';
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch('http://localhost:5000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessType, location, searchMode })
      });
      const data = await response.json();
      console.log(data);
      if (response.ok) {
        // Filter out excluded domains
        const activeExclusions = JSON.parse(localStorage.getItem('tse_excluded_domains') || '[]');
        const filteredData = data.filter(item => {
          const itemDomain = item.domain || getDomain(item.website || item.url);
          return !activeExclusions.includes(itemDomain);
        });

        const enrichedData = filteredData.map((item, idx) => {
          const isOrganic = !item.name;
          const url = isOrganic ? item.url : (item.website || '');
          const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
          
          let existingAnalysis = null;
          const recentMatch = recentAnalyses.find(a => 
            (url && a.url === url) || 
            (domain && a.domain === domain)
          );
          if (recentMatch) {
            existingAnalysis = recentMatch.analysis;
          } else {
            for (const search of savedSearches) {
              if (search.data) {
                const match = search.data.find(subItem => {
                  const subOrganic = !subItem.name;
                  const subKey = subOrganic ? subItem.url : (subItem.website || subItem.name);
                  return (url && subKey === url) || (domain && getDomain(subKey) === domain);
                });
                if (match && match.analysis) {
                  existingAnalysis = match.analysis;
                  break;
                }
              }
            }
          }

          const rankVal = item.rank !== undefined && item.rank !== null ? item.rank : idx + 1;

          if (existingAnalysis) {
            return {
              ...item,
              rank: rankVal,
              analysis: {
                ...existingAnalysis,
                rank: rankVal
              }
            };
          }
          return { ...item, rank: rankVal };
        });

        setSearchResults(enrichedData);
        setCurrentPage(1);
        setSortColumn(null);
        setSortDirection('asc');
        
        // Save search automatically
        setSavedSearches(prev => {
          let maxIdNum = 0;
          prev.forEach(s => {
            if (s.searchId) {
              const match = s.searchId.match(/SR(\d+)/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxIdNum) {
                  maxIdNum = num;
                }
              }
            }
          });
          const nextIdNum = maxIdNum + 1;
          const nextIdStr = `SR${String(nextIdNum).padStart(4, '0')}`;
          
          setActiveSearchId(nextIdStr);

          const newSearch = {
            id: Date.now().toString(),
            searchId: nextIdStr,
            searchType: searchMode === 'organic' ? 'Organic' : 'GMB',
            businessType: businessType.trim() || 'Any',
            location: location.trim() || 'Anywhere',
            searchMode: searchMode,
            dateTime: new Date().toLocaleString(),
            count: enrichedData.length,
            data: enrichedData
          };
          const updated = [newSearch, ...prev];
          localStorage.setItem('tse_saved_searches', JSON.stringify(updated));
          return updated;
        });
      } else {
        setSearchError(data.error || 'Search failed');
      }
    } catch (e) {
      console.error(e);
      setSearchError('Connection error: ' + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNewSearchNav = () => {
    setBusinessType('');
    setLocation('');
    setSearchMode('organic');
    setSearchResults([]);
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection('asc');
    setActiveSearchId(null);
    setActiveAnalysisItem(null);
    setCurrentView('search');
  };

  const handleLoadSavedSearch = (saved) => {
    setBusinessType(saved.businessType === 'Any' ? '' : saved.businessType);
    setLocation(saved.location === 'Anywhere' ? '' : saved.location);
    setSearchMode(saved.searchMode || 'local');
    setActiveSearchId(saved.searchId || null);
    
    // Filter stored results against current exclusions dynamically
    const activeExclusions = JSON.parse(localStorage.getItem('tse_excluded_domains') || '[]');
    const filtered = saved.data
      .filter(item => {
        const itemDomain = item.domain || getDomain(item.website || item.url);
        return !activeExclusions.includes(itemDomain);
      })
      .map((item, idx) => {
        if (item.rank === undefined || item.rank === null) {
          return { ...item, rank: idx + 1 };
        }
        return item;
      });

    // Enrich with any existing cached analysis matching domain/URL
    const enriched = filtered.map(item => {
      if (item.analysis) return item;
      
      const isOrganic = !item.name;
      const url = isOrganic ? item.url : (item.website || '');
      const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
      
      let existingAnalysis = null;
      const recentMatch = recentAnalyses.find(a => 
        (url && a.url === url) || 
        (domain && a.domain === domain)
      );
      if (recentMatch) {
        existingAnalysis = recentMatch.analysis;
      } else {
        for (const search of savedSearches) {
          if (search.data) {
            const match = search.data.find(subItem => {
              const subOrganic = !subItem.name;
              const subKey = subOrganic ? subItem.url : (subItem.website || subItem.name);
              return (url && subKey === url) || (domain && getDomain(subKey) === domain);
            });
            if (match && match.analysis) {
              existingAnalysis = match.analysis;
              break;
            }
          }
        }
      }
      
      if (existingAnalysis) {
        return { 
          ...item, 
          analysis: {
            ...existingAnalysis,
            rank: item.rank
          } 
        };
      }
      return item;
    });

    setSearchResults(enriched);
    setCurrentPage(1);
    setSortColumn(null);
    setSortDirection('asc');
    setCurrentView('search');
  };

  const handleDeleteSavedSearch = (id) => {
    setSavedSearches(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem('tse_saved_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const addToRecentAnalyses = (analysisObj) => {
    setRecentAnalyses(prev => {
      const filtered = prev.filter(a => a.domain !== analysisObj.domain);
      const updated = [
        {
          domain: analysisObj.domain,
          url: analysisObj.url,
          searchId: analysisObj.searchId,
          searchType: analysisObj.searchType,
          dateTime: analysisObj.lastAnalysed || new Date().toLocaleString(),
          analysis: analysisObj
        },
        ...filtered
      ].slice(0, 20);
      localStorage.setItem('tse_recent_analyses', JSON.stringify(updated));
      return updated;
    });
  };

  const handleLoadRecentAnalysis = (recent) => {
    setActiveAnalysisItem(recent.analysis);
    setBusinessType(recent.analysis.searchKeyword === 'Any' ? '' : recent.analysis.searchKeyword);
    setLocation(recent.analysis.location === 'Anywhere' ? '' : recent.analysis.location);
    setSearchMode(recent.analysis.searchType === 'Organic' ? 'organic' : 'local');
    setActiveSearchId(recent.analysis.searchId);
    
    addToRecentAnalyses(recent.analysis);
    setCurrentView('analyse');
  };

  const updateItemAnalysis = (urlOrName, analysisData) => {
    // 1. Update searchResults state
    setSearchResults(prev => prev.map(item => {
      const isOrganic = !item.name;
      const key = isOrganic ? item.url : (item.website || item.name);
      if (key === urlOrName) {
        return { ...item, analysis: analysisData };
      }
      return item;
    }));

    // 2. Update savedSearches state and localStorage
    setSavedSearches(prev => {
      const updated = prev.map(saved => {
        if (saved.searchId === activeSearchId) {
          const updatedData = saved.data.map(item => {
            const isOrganic = !item.name;
            const key = isOrganic ? item.url : (item.website || item.name);
            if (key === urlOrName) {
              return { ...item, analysis: analysisData };
            }
            return item;
          });
          return { ...saved, data: updatedData };
        }
        return saved;
      });
      localStorage.setItem('tse_saved_searches', JSON.stringify(updated));
      return updated;
    });
  };

  const analyseItem = async (item) => {
    const isOrganic = !item.name;
    const url = isOrganic ? item.url : (item.website || '');
    const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
    const itemKey = isOrganic ? item.url : (item.website || item.name);

    if (item.analysis) {
      return item.analysis;
    }

    try {
      const response = await fetch('http://localhost:5000/api/analyse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          url: url || domain,
          searchType: isOrganic ? 'Organic' : 'GMB',
          rank: item.rank || 0,
          location: location || 'Anywhere'
        })
      });
      const data = await response.json();
      
      const completedAnalysis = {
        rank: item.rank || data.leadOpportunity?.rank || 0,
        pageTitle: data.pageTitle || 'Not Found',
        metaDescription: data.metaDescription || 'Not Found',
        h1: data.h1 || 'Not Found',
        httpStatus: data.httpStatus || 'Not Found',
        canonicalUrl: data.canonicalUrl || 'Not Found',
        indexable: data.indexable || 'No',
        lastAnalysed: data.lastAnalysed || new Date().toISOString(),
        seoHealth: data.seoHealth || null,
        aiReport: data.aiReport || null,
        gbp: data.gbp || null,
        leadOpportunityScore: data.leadOpportunityScore || null,
        leadPriority: data.leadPriority || null
      };

      updateItemAnalysis(itemKey, completedAnalysis);
      return completedAnalysis;
    } catch (e) {
      console.error(e);
      const failedAnalysis = {
        rank: item.rank || 0,
        pageTitle: 'Not Found',
        metaDescription: 'Not Found',
        h1: 'Not Found',
        httpStatus: 'Connection Error',
        canonicalUrl: 'Not Found',
        indexable: 'No',
        lastAnalysed: new Date().toISOString(),
        seoHealth: {
          isHttps: url.startsWith('https://'),
          statusCode: 0,
          indexable: false,
          hasCanonical: false,
          titlePresent: false,
          titleLength: 0,
          descriptionPresent: false,
          descriptionLength: 0,
          h1Present: false,
          h1Count: 0,
          h2Count: 0,
          wordCount: 0,
          imageCount: 0,
          missingAltCount: 0,
          internalLinksCount: 0,
          externalLinksCount: 0
        },
        aiReport: null,
        leadOpportunity: {
          rank: isOrganic ? (item.rank || 'Not available') : 'Not available',
          gbpDetected: isOrganic ? 'Unknown' : 'Yes',
          titlePresent: 'Missing',
          descriptionPresent: 'Missing',
          h1Present: 'Missing',
          pageType: 'Homepage',
          overallOpportunity: 'High',
          reasonToContact: 'Connection error while attempting to analyze site.',
          suggestedEmailAngle: 'Reach out to check if their website server is experiencing downtime.'
        },
        gbp: null,
        leadOpportunityScore: {
          score: 85,
          band: 'Very High',
          reasons: [
            "Website connection failed or timed out",
            "Page is blocked from indexation by noindex tags",
            "First H1 heading tag is missing",
            "HTML meta title tag is missing",
            "HTML meta description tag is missing"
          ]
        },
        leadPriority: {
          stars: '★☆☆☆☆',
          label: 'Poor Fit',
          explanation: "Due to a website connection timeout or loading error, this business is currently classified as a poor fit for premium digital services.",
          points: 5
        }
      };
      updateItemAnalysis(itemKey, failedAnalysis);
      return failedAnalysis;
    }
  };

  const handleAnalyseAll = async () => {
    if (isBulkAnalysing || searchResults.length === 0) return;
    
    setIsBulkAnalysing(true);
    const total = searchResults.length;
    setBulkProgress({ current: 0, total });

    for (let i = 0; i < total; i++) {
      setBulkProgress({ current: i + 1, total });
      const item = searchResults[i];
      await analyseItem(item);
    }

    setIsBulkAnalysing(false);
  };

  const handleAnalyse = async (item) => {
    const isOrganic = !item.name;
    const url = isOrganic ? item.url : (item.website || '');
    const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
    const itemKey = isOrganic ? item.url : (item.website || item.name);

    if (item.analysis) {
      const analysisObj = {
        ...item.analysis,
        domain,
        url,
        searchId: activeSearchId || 'Not available',
        searchType: isOrganic ? 'Organic' : 'GMB',
        searchKeyword: businessType || 'Any',
        location: location || 'Anywhere',
        rank: item.rank || item.analysis?.rank || 0
      };
      setActiveAnalysisItem(analysisObj);
      addToRecentAnalyses(analysisObj);
      setCurrentView('analyse');
      return;
    }

    setIsAnalysing(true);
    setAnalysisError(null);
    setCurrentView('analyse');
    
    const initialObj = {
      domain,
      url,
      rank: item.rank || 0,
      searchId: activeSearchId || 'Not available',
      searchType: isOrganic ? 'Organic' : 'GMB',
      searchKeyword: businessType || 'Any',
      location: location || 'Anywhere',
      pageTitle: 'Loading...',
      metaDescription: 'Loading...',
      h1: 'Loading...',
      httpStatus: 'Loading...',
      canonicalUrl: 'Loading...',
      indexable: 'Loading...',
      lastAnalysed: 'Loading...',
      seoHealth: null,
      aiReport: null,
      leadOpportunity: null
    };
    setActiveAnalysisItem(initialObj);

    const completedAnalysis = await analyseItem(item);
    
    if (completedAnalysis.httpStatus === 'Connection Error') {
      setAnalysisError('Failed to fetch website: Connection error while attempting to analyze site.');
    }

    const finalObj = {
      ...completedAnalysis,
      domain,
      url,
      searchId: activeSearchId || 'Not available',
      searchType: isOrganic ? 'Organic' : 'GMB',
      searchKeyword: businessType || 'Any',
      location: location || 'Anywhere',
      rank: item.rank || completedAnalysis.rank || 0
    };
    setActiveAnalysisItem(finalObj);
    addToRecentAnalyses(finalObj);
    setIsAnalysing(false);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection(column === 'score' ? 'desc' : 'asc');
    }
  };

  const renderSortIndicator = (column) => {
    const isActive = sortColumn === column;
    const isAsc = sortDirection === 'asc';
    
    return (
      <span style={{ marginLeft: '6px', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', gap: '2px', verticalAlign: 'middle', userSelect: 'none' }}>
        <span style={{ color: isActive && isAsc ? '#60a5fa' : '#475569' }}>▲</span>
        <span style={{ color: isActive && !isAsc ? '#60a5fa' : '#475569' }}>▼</span>
      </span>
    );
  };

  const getSortedResults = () => {
    if (!sortColumn) return searchResults;

    const sorted = [...searchResults];
    sorted.sort((a, b) => {
      if (sortColumn === 'position') {
        const valA = parseInt(a.rank, 10) || 999;
        const valB = parseInt(b.rank, 10) || 999;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (sortColumn === 'rating') {
        const valA = parseFloat(a.rating) || 0;
        const valB = parseFloat(b.rating) || 0;
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      if (sortColumn === 'score') {
        const scoreA = a.analysis?.leadOpportunityScore?.score ?? -1;
        const scoreB = b.analysis?.leadOpportunityScore?.score ?? -1;
        return sortDirection === 'asc' ? scoreA - scoreB : scoreB - scoreA;
      }

      if (sortColumn === 'domain') {
        const valA = (a.domain || a.url || a.website || a.name || '').toLowerCase();
        const valB = (b.domain || b.url || b.website || b.name || '').toLowerCase();
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      }

      return 0;
    });

    return sorted;
  };

  const renderTruncatedMetaValue = (val, maxLength = 80) => {
    if (!val || val === 'Not Found' || val === 'Loading...') {
      return <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Missing</span>;
    }
    if (val.length > maxLength) {
      return (
        <span title={val} style={{ cursor: 'help', textDecoration: 'underline dotted #64748b' }}>
          {val.substring(0, maxLength)}...
        </span>
      );
    }
    return val;
  };

  const getSearchPhrase = (keyword, loc) => {
    const k = keyword === 'Any' ? '' : (keyword || '').trim();
    const l = loc === 'Anywhere' ? '' : (loc || '').trim();
    return `${k} ${l}`.trim() || 'Not available';
  };

  const formatLastAnalysed = (dateStr) => {
    if (!dateStr || dateStr === 'Loading...') return dateStr;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        const parts = dateStr.split(/[\s,]+/);
        const datePart = parts[0];
        const timePart = parts[1];
        
        if (datePart && datePart.includes('/')) {
          const [d, m, y] = datePart.split('/');
          const timeClean = timePart ? timePart.split(':').slice(0, 2).join(':') : '';
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const monthName = months[parseInt(m, 10) - 1] || m;
          return `${d} ${monthName} ${y} ${timeClean}`.trim();
        }
        return dateStr;
      }
      const day = date.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day} ${month} ${year} ${hours}:${minutes}`;
    } catch (e) {
      return dateStr;
    }
  };

  const handleRefreshAnalysis = async () => {
    if (!activeAnalysisItem) return;
    setIsRefreshing(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/analyse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          url: activeAnalysisItem.url || activeAnalysisItem.domain,
          searchType: activeAnalysisItem.searchType,
          rank: activeAnalysisItem.leadOpportunity?.rank || activeAnalysisItem.rank || 0,
          location: activeAnalysisItem.location || location || 'Anywhere'
        })
      });
      const data = await response.json();
      
      const completedAnalysis = {
        pageTitle: data.pageTitle || 'Not Found',
        metaDescription: data.metaDescription || 'Not Found',
        h1: data.h1 || 'Not Found',
        httpStatus: data.httpStatus || 'Not Found',
        canonicalUrl: data.canonicalUrl || 'Not Found',
        indexable: data.indexable || 'No',
        lastAnalysed: data.lastAnalysed || new Date().toISOString(),
        seoHealth: data.seoHealth || null,
        aiReport: data.aiReport || null,
        leadOpportunity: data.leadOpportunity || null,
        gbp: data.gbp || null,
        leadOpportunityScore: data.leadOpportunityScore || null,
        leadPriority: data.leadPriority || null
      };

      const itemKey = activeAnalysisItem.url || activeAnalysisItem.domain;
      updateItemAnalysis(itemKey, completedAnalysis);

      const updatedObj = {
        ...completedAnalysis,
        domain: activeAnalysisItem.domain,
        url: activeAnalysisItem.url,
        searchId: activeAnalysisItem.searchId,
        searchType: activeAnalysisItem.searchType,
        searchKeyword: activeAnalysisItem.searchKeyword,
        location: activeAnalysisItem.location,
        rank: activeAnalysisItem.rank || completedAnalysis.rank || 0
      };
      setActiveAnalysisItem(updatedObj);
      addToRecentAnalyses(updatedObj);
      
    } catch (e) {
      console.error(e);
      alert('Failed to refresh analysis: ' + e.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getRecommendedSalesAngle = (item) => {
    const bullets = [];
    const health = item.seoHealth;
    const gbp = item.gbp;
    const rank = parseInt(item.rank, 10);

    if (health) {
      if (health.statusCode !== 200) {
        bullets.push("• Resolving critical technical accessibility and security bottlenecks will restore search indexation and user trust.");
      }
      if (!health.isHttps) {
        bullets.push("• Securing the website with HTTPS will eliminate browser warning screens and protect user data.");
      }
    }

    if (gbp) {
      if (gbp.status === 'Not Found') {
        bullets.push("• Creating and claiming a Google Business Profile presents a massive growth opportunity to capture local pack visibility.");
      } else if (gbp.status === 'Multiple Matches') {
        bullets.push("• Resolving multiple conflicting Google Business Profile listings will eliminate client confusion and build local authority.");
      } else if (gbp.status === 'Found') {
        const rating = parseFloat(gbp.rating);
        const reviews = parseInt(gbp.reviewCount, 10);
        if (!isNaN(rating) && rating < 4.0) {
          bullets.push(`• Enhancing customer reviews to lift their rating (${rating}★) is a high-impact opportunity to increase trust and clicks.`);
        } else if (!isNaN(reviews) && reviews < 30) {
          bullets.push(`• Boosting review volume from the current count (${reviews} reviews) will strengthen social proof against competitors.`);
        }
      }
    }

    if (!isNaN(rank) && (rank > 10 || rank === 0)) {
      bullets.push("• Google search visibility can be significantly improved to push their listing onto page one.");
    }

    if (health) {
      if (!health.titlePresent || !health.descriptionPresent || health.titleLength > 60 || health.descriptionLength > 160) {
        bullets.push("• Optimizing sub-optimal metadata lengths is a quick win to increase clicks on search engine results pages.");
      }
      if (!health.h1Present || health.h1Count > 1) {
        bullets.push("• Restructuring primary H1 heading tags will improve search indexing clarity and bounce rates.");
      }
      if (health.wordCount < 600) {
        bullets.push("• Expanding thin content depth will help establish topical authority and support higher search visibility.");
      }
      if (health.internalLinksCount < 5) {
        bullets.push("• Improving internal link structures will enhance search crawler discoverability and user navigation.");
      }
    }

    if (bullets.length < 1) {
      bullets.push("• Implementing local schema markup will enhance rich snippet visibility in search results.");
    }
    if (bullets.length < 2) {
      bullets.push("• Creating targeted service landing pages will capture additional high-intent buyers in neighbouring areas.");
    }
    if (bullets.length < 3) {
      bullets.push("• Restructuring call-to-action elements on the homepage will lift conversion rates and lead generation.");
    }

    return bullets.slice(0, 3);
  };

  const getCheckStatus = (type, key, value, health) => {
    if (!health) return { label: 'Loading...', color: '#94a3b8' };
    
    switch (key) {
      case 'https':
        return value ? { label: 'Pass', color: '#10b981' } : { label: 'Fail', color: '#ef4444' };
      case 'status':
        if (value === 200) return { label: 'Pass (200 OK)', color: '#10b981' };
        if (value >= 300 && value < 400) return { label: `Warning (${value})`, color: '#f59e0b' };
        return { label: `Fail (${value || 'Error'})`, color: '#ef4444' };
      case 'indexable':
        return value ? { label: 'Pass', color: '#10b981' } : { label: 'Fail (Noindex)', color: '#ef4444' };
      case 'canonical':
        return value ? { label: 'Pass', color: '#10b981' } : { label: 'Fail (Missing)', color: '#ef4444' };
      
      case 'title':
        return value ? { label: 'Pass', color: '#10b981' } : { label: 'Fail (Missing)', color: '#ef4444' };
      case 'titleLength':
        if (value >= 50 && value <= 60) return { label: `Pass (${value} chars)`, color: '#10b981' };
        if (value > 0) return { label: `Warning (${value} chars - optimal is 50-60)`, color: '#f59e0b' };
        return { label: 'Fail (0 chars)', color: '#ef4444' };
      case 'description':
        return value ? { label: 'Pass', color: '#10b981' } : { label: 'Fail (Missing)', color: '#ef4444' };
      case 'descriptionLength':
        if (value >= 120 && value <= 160) return { label: `Pass (${value} chars)`, color: '#10b981' };
        if (value > 0) return { label: `Warning (${value} chars - optimal is 120-160)`, color: '#f59e0b' };
        return { label: 'Fail (0 chars)', color: '#ef4444' };
      case 'h1':
        if (health.h1Count === 1) return { label: 'Pass (1 found)', color: '#10b981' };
        if (health.h1Count > 1) return { label: `Warning (${health.h1Count} found - recommend only 1)`, color: '#f59e0b' };
        return { label: 'Fail (Missing)', color: '#ef4444' };
      case 'h2':
        return value > 0 ? { label: `Pass (${value} found)`, color: '#10b981' } : { label: 'Warning (0 found)', color: '#f59e0b' };
      case 'wordCount':
        if (value >= 600) return { label: `Pass (${value} words)`, color: '#10b981' };
        if (value >= 300) return { label: `Warning (${value} words - recommend 600+)`, color: '#f59e0b' };
        return { label: `Fail (${value} words - too thin)`, color: '#ef4444' };
        
      case 'images':
        return value > 0 ? { label: `Info (${value} images)`, color: '#60a5fa' } : { label: 'Info (0 images)', color: '#94a3b8' };
      case 'altText':
        if (health.imageCount === 0) return { label: 'Pass (No images)', color: '#10b981' };
        return value === 0 ? { label: 'Pass (All images have ALT)', color: '#10b981' } : { label: `Warning (${value} missing ALT)`, color: '#f59e0b' };
      case 'internalLinks':
        return value > 0 ? { label: `Pass (${value} found)`, color: '#10b981' } : { label: 'Warning (0 found)', color: '#f59e0b' };
      case 'externalLinks':
        return value > 0 ? { label: `Pass (${value} found)`, color: '#10b981' } : { label: 'Warning (0 found)', color: '#f59e0b' };
      default:
        return { label: 'Info', color: '#cbd5e1' };
    }
  };

  const handleExcludeDomain = (urlOrDomain) => {
    if (!urlOrDomain) return;
    let domain = urlOrDomain;
    if (domain.includes('://')) {
      domain = getDomain(domain);
    }
    if (!domain) return;
    
    setExcludedDomains(prev => {
      if (prev.includes(domain)) return prev;
      const updated = [...prev, domain];
      localStorage.setItem('tse_excluded_domains', JSON.stringify(updated));
      return updated;
    });

    // Immediately remove from currently displayed results
    setSearchResults(prev => prev.filter(item => {
      const itemDomain = item.domain || getDomain(item.website || item.url);
      return itemDomain !== domain;
    }));
  };

  const handleRemoveExclusion = (domain) => {
    setExcludedDomains(prev => {
      const updated = prev.filter(d => d !== domain);
      localStorage.setItem('tse_excluded_domains', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="app-container">
      
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
          <h2 className="sidebar-title">TSE Leads</h2>
          <div className="sidebar-menu">
            <button 
              onClick={handleNewSearchNav} 
              className={`sidebar-item ${currentView === 'search' ? 'active' : ''}`}
            >
              New Search
            </button>
            <button 
              onClick={() => setCurrentView('saved')} 
              className={`sidebar-item ${currentView === 'saved' ? 'active' : ''}`}
            >
              Saved Searches
            </button>
            <button 
              onClick={() => setCurrentView('exclusions')} 
              className={`sidebar-item ${currentView === 'exclusions' ? 'active' : ''}`}
            >
              Manage Exclusions
            </button>
            <button 
              onClick={() => setCurrentView('settings')} 
              className={`sidebar-item ${currentView === 'settings' ? 'active' : ''}`}
            >
              Settings
            </button>
          </div>

          <div style={{ flexGrow: 1 }} className="sidebar-spacer" />

          {/* Recent Analyses Sidebar Section */}
          <div className="sidebar-recent-section" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #334155' }}>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', display: 'block', marginBottom: '0.75rem', paddingLeft: '0.75rem', fontWeight: 'bold' }}>
              Recent Analyses
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentAnalyses.slice(0, 5).map((recent, index) => (
                <button
                  key={index}
                  onClick={() => handleLoadRecentAnalysis(recent)}
                  className="sidebar-item"
                  style={{ 
                    textAlign: 'left', 
                    fontSize: '0.85rem', 
                    padding: '0.5rem 0.75rem', 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    border: 'none',
                    background: activeAnalysisItem?.domain === recent.domain && currentView === 'analyse' ? '#1e293b' : 'transparent',
                    color: activeAnalysisItem?.domain === recent.domain && currentView === 'analyse' ? '#ffffff' : '#94a3b8',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                  title={recent.domain}
                >
                  {recent.domain}
                </button>
              ))}
              {recentAnalyses.length === 0 && (
                <span style={{ fontSize: '0.8rem', color: '#64748b', paddingLeft: '0.75rem', fontStyle: 'italic' }}>
                  No recent analyses
                </span>
              )}
              {recentAnalyses.length > 0 && (
                <a 
                  href="#" 
                  onClick={(e) => {
                    e.preventDefault();
                    alert('View All recent analyses is coming in the next version.');
                  }}
                  style={{ fontSize: '0.75rem', color: '#3b82f6', textDecoration: 'none', paddingLeft: '0.75rem', marginTop: '0.25rem', display: 'inline-block' }}
                >
                  View All...
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {currentView === 'search' && (
          <>
            <div className="search-header-container">
              <h1 className="header-title">TSE Lead Generation Finder</h1>
              <p className="header-subtitle">Find local businesses ready for SEO, AI and digital growth.</p>
              
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600', color: '#cbd5e1' }}>
                  <input 
                    type="radio" 
                    name="searchMode" 
                    value="organic" 
                    checked={searchMode === 'organic'} 
                    onChange={() => setSearchMode('organic')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  Google Organic SERP
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: '600', color: '#cbd5e1' }}>
                  <input 
                    type="radio" 
                    name="searchMode" 
                    value="local" 
                    checked={searchMode === 'local'} 
                    onChange={() => setSearchMode('local')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  Local Business Listings
                </label>
              </div>

              <div className="search-form-row">
                <div className="input-group">
                  <label className="input-label">Business Type</label>
                  <input 
                    type="text" 
                    value={businessType} 
                    onChange={(e) => setBusinessType(e.target.value)} 
                    placeholder="e.g. Dentists, Plumbers"
                    className="search-input"
                    disabled={isSearching}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Location</label>
                  <input 
                    type="text" 
                    value={location} 
                    onChange={(e) => setLocation(e.target.value)} 
                    placeholder="e.g. Bristol, London"
                    className="search-input"
                    disabled={isSearching}
                  />
                </div>

                <button 
                  onClick={handleSearch} 
                  className="search-btn"
                  disabled={isSearching}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {isSearching && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', color: '#60a5fa', fontSize: '0.95rem' }}>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    border: '2px solid rgba(96, 165, 250, 0.2)',
                    borderTopColor: '#60a5fa',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}></div>
                  <span>Fetching live business listings from DataForSEO...</span>
                </div>
              )}

              {searchError && (
                <div style={{ color: '#ef4444', marginTop: '1.25rem', fontSize: '0.95rem', fontWeight: '500' }}>
                  Error: {searchError}
                </div>
              )}

              <div className="results-header-row">
                <div className="results-count-text">
                  {searchMode === 'organic' ? (
                    searchResults.length < 50 ? (
                      `Search exhausted – ${searchResults.length} organic results found.`
                    ) : (
                      `Results: ${searchResults.length} organic results found.`
                    )
                  ) : (
                    `Results: ${searchResults.length} businesses found`
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {isBulkAnalysing ? (
                      <span style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 'bold' }}>
                        Analysing {bulkProgress.current} of {bulkProgress.total}...
                      </span>
                    ) : (
                      <button 
                        onClick={handleAnalyseAll}
                        className="analyse-btn-green"
                        style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                      >
                        Analyse All Results
                      </button>
                    )}
                    <button 
                      onClick={handleSearch} 
                      className="search-btn" 
                      style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
                      disabled={isSearching}
                    >
                      {isSearching ? 'Refreshing...' : 'Refresh Live Data'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {Array.isArray(searchResults) && searchResults.length > 0 && (() => {
              const ITEMS_PER_PAGE = 10;
              const sortedResults = getSortedResults();
              const totalPages = Math.ceil(sortedResults.length / ITEMS_PER_PAGE);
              const paginatedResults = sortedResults.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
              const isOrganicResult = searchMode === 'organic';

              return (
                <>
                <div className="results-table-container">
                  <table className="results-table">
                    <thead>
                      {isOrganicResult ? (
                        <tr>
                          <th onClick={() => handleSort('position')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Position {renderSortIndicator('position')}
                          </th>
                          <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Score {renderSortIndicator('score')}
                          </th>
                          <th onClick={() => handleSort('domain')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Domain / URL {renderSortIndicator('domain')}
                          </th>
                          <th>Google Snippet</th>
                          <th className="action-cell">Action</th>
                        </tr>
                      ) : (
                        <tr>
                          <th onClick={() => handleSort('rating')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Rating {renderSortIndicator('rating')}
                          </th>
                          <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Score {renderSortIndicator('score')}
                          </th>
                          <th>Business Name</th>
                          <th onClick={() => handleSort('domain')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Website {renderSortIndicator('domain')}
                          </th>
                          <th>Phone</th>
                          <th>Address</th>
                          <th className="action-cell">Action</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {paginatedResults.map((item, index) => {
                        if (isOrganicResult) {
                          return (
                            <tr key={index}>
                              <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>#{item.rank}</td>
                              <td>
                                {item.analysis ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <span style={{ 
                                      color: item.analysis.leadOpportunityScore?.score >= 70 ? '#ef4444' : (item.analysis.leadOpportunityScore?.score >= 40 ? '#f59e0b' : '#10b981'),
                                      marginRight: '6px',
                                      fontSize: '1.1rem',
                                      lineHeight: '1'
                                    }}>●</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#ffffff' }}>
                                      {item.analysis.leadOpportunityScore?.score ?? 0}
                                    </span>
                                  </span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>-</span>
                                )}
                              </td>
                              <td className="domain-url-cell">
                                <div>
                                  {item.url ? (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="table-link" style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                      {item.domain || item.url}
                                    </a>
                                  ) : "Not available"}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', wordBreak: 'break-all', marginTop: '0.25rem' }}>
                                  {item.url || "Not available"}
                                </div>
                              </td>
                              <td className="organic-description-cell">{item.description || "Not available"}</td>
                              <td className="action-cell">
                                <button 
                                  onClick={() => handleAnalyse(item)}
                                  className="analyse-btn-green" 
                                  style={{ marginRight: '8px' }}
                                >
                                  {item.analysis ? 'View' : 'Analyse'}
                                </button>
                                <button 
                                  onClick={() => handleExcludeDomain(item.domain || item.url)}
                                  className="table-btn"
                                  style={{ backgroundColor: '#ef4444' }}
                                >
                                  Exclude
                                </button>
                              </td>
                            </tr>
                          );
                        } else {
                          let domain = '';
                          if (item.website) {
                            try {
                              domain = new URL(item.website).hostname.replace(/^www\./, '');
                            } catch (e) {
                              domain = item.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
                            }
                          }
                          return (
                            <tr key={index}>
                              <td>
                                {item.rating !== null && item.rating !== undefined ? `⭐ ${item.rating}` : "Not available"}
                              </td>
                              <td>
                                {item.analysis ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                    <span style={{ 
                                      color: item.analysis.leadOpportunityScore?.score >= 70 ? '#ef4444' : (item.analysis.leadOpportunityScore?.score >= 40 ? '#f59e0b' : '#10b981'),
                                      marginRight: '6px',
                                      fontSize: '1.1rem',
                                      lineHeight: '1'
                                    }}>●</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#ffffff' }}>
                                      {item.analysis.leadOpportunityScore?.score ?? 0}
                                    </span>
                                  </span>
                                ) : (
                                  <span style={{ color: '#64748b' }}>-</span>
                                )}
                              </td>
                              <td><strong>{item.name || "Not available"}</strong></td>
                              <td>
                                {item.website ? (
                                  <a href={item.website} target="_blank" rel="noopener noreferrer" className="table-link">{domain || item.website}</a>
                                ) : "Not available"}
                              </td>
                              <td>
                                {item.phone ? (
                                  <a href={`tel:${item.phone}`} className="table-link">{item.phone}</a>
                                ) : "Not available"}
                              </td>
                              <td>{item.address || "Not available"}</td>
                              <td className="action-cell">
                                <button 
                                  onClick={() => handleAnalyse(item)}
                                  className="analyse-btn-green" 
                                  style={{ marginRight: '8px' }}
                                >
                                  {item.analysis ? 'View' : 'Analyse'}
                                </button>
                                <button 
                                  onClick={() => handleExcludeDomain(domain || item.website)}
                                  className="table-btn"
                                  style={{ backgroundColor: '#ef4444' }}
                                >
                                  Exclude
                                </button>
                              </td>
                            </tr>
                          );
                        }
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '2rem' }}>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                      disabled={currentPage === 1}
                      className="table-btn"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Previous
                    </button>
                    
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className="table-btn"
                        style={{ 
                          padding: '0.5rem 1rem', 
                          backgroundColor: currentPage === page ? '#3b82f6' : '#1e293b',
                          border: '1px solid #334155',
                          color: '#ffffff'
                        }}
                      >
                        {page}
                      </button>
                    ))}

                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                      disabled={currentPage === totalPages}
                      className="table-btn"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            );
          })()}
          </>
        )}

        {currentView === 'saved' && (
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Search Type</th>
                  <th>Business Type</th>
                  <th>Location</th>
                  <th>Saved Date/Time</th>
                  <th>Results Count</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {savedSearches.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      No saved searches found. Every successful search will be automatically saved here.
                    </td>
                  </tr>
                ) : (
                  savedSearches.map((saved) => (
                    <tr key={saved.id} style={{ cursor: 'pointer' }} onClick={() => handleLoadSavedSearch(saved)}>
                      <td><code style={{ color: '#60a5fa', fontWeight: 'bold' }}>{saved.searchId}</code></td>
                      <td style={{ fontWeight: 'bold', color: saved.searchType === 'Organic' ? '#38bdf8' : '#34d399' }}>{saved.searchType || 'GMB'}</td>
                      <td>{saved.businessType}</td>
                      <td>{saved.location}</td>
                      <td>{saved.dateTime}</td>
                      <td>{saved.count}</td>
                      <td>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLoadSavedSearch(saved);
                          }} 
                          className="table-btn"
                          style={{ marginRight: '0.5rem' }}
                        >
                          View Results
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSavedSearch(saved.id);
                          }} 
                          className="table-btn"
                          style={{ backgroundColor: '#ef4444' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {currentView === 'exclusions' && (
          <div className="results-table-container">
            <h2 style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', margin: 0, color: '#ffffff' }}>Excluded Domains</h2>
            <p style={{ padding: '0 1.5rem 1.5rem 1.5rem', margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
              These domains are filtered out of all GMB and Organic search results.
            </p>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Domain Name</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {excludedDomains.length === 0 ? (
                  <tr>
                    <td colSpan="2" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      No domains excluded yet.
                    </td>
                  </tr>
                ) : (
                  excludedDomains.map((domain, index) => (
                    <tr key={index}>
                      <td style={{ fontWeight: 'bold', color: '#f8fafc' }}>{domain}</td>
                      <td>
                        <button 
                          onClick={() => handleRemoveExclusion(domain)} 
                          className="table-btn"
                          style={{ backgroundColor: '#ef4444' }}
                        >
                          Remove Exclusion
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {currentView === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem' }}>
            <div className="search-header-container" style={{ marginBottom: 0 }}>
              <h1 className="header-title">Settings</h1>
              <p className="header-subtitle">Configure application settings and track project release history.</p>
            </div>

            {/* Version History & Milestone Manager */}
            <div className="results-table-container" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem' }}>Version History & Milestone Manager</h2>
              
              {/* Current Version Panel */}
              {(() => {
                const currentMilestone = milestones[milestones.length - 1];
                return (
                  <div style={{
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    border: '1px dashed #3b82f6',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    color: '#f8fafc'
                  }}>
                    <h3 style={{ margin: '0 0 0.75rem 0', color: '#60a5fa', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%' }}></span>
                      Current Active Release
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', fontSize: '0.9rem' }}>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Current Version</span>
                        <strong>{currentMilestone?.version || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Git Tag</span>
                        <code style={{ color: '#38bdf8' }}>{currentMilestone?.gitTag || 'N/A'}</code>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Commit Hash</span>
                        <code style={{ color: '#e2e8f0', fontSize: '0.8rem' }} title={currentMilestone?.commitHash}>
                          {currentMilestone?.commitHash ? currentMilestone.commitHash.substring(0, 8) : 'N/A'}
                        </code>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Release Date</span>
                        <span>{currentMilestone ? formatLastAnalysed(currentMilestone.date) : 'N/A'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Release Status</span>
                        <span style={{ 
                          color: '#10b981',
                          fontWeight: 'bold', 
                          display: 'inline-block', 
                          backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                          padding: '0.1rem 0.5rem', 
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}>
                          {currentMilestone?.status || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Milestones History Table */}
              <div>
                <h3 style={{ margin: '1rem 0 0.75rem 0', color: '#f1f5f9', fontSize: '1.1rem' }}>Historical Milestones</h3>
                <div style={{ overflowX: 'auto', border: '1px solid #334155', borderRadius: '6px' }}>
                  <table className="results-table" style={{ border: 'none', margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th>Version</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Git Tag</th>
                        <th>Commit Hash</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isMilestonesLoading && milestones.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                            Loading version history...
                          </td>
                        </tr>
                      ) : milestonesError ? (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
                            Error loading milestones: {milestonesError}
                          </td>
                        </tr>
                      ) : (
                        milestones.map((m) => {
                          const isExpanded = !!expandedMilestones[m.version];
                          return (
                            <React.Fragment key={m.version}>
                              <tr 
                                onClick={() => toggleMilestoneExpanded(m.version)}
                                style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              >
                                <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                                  {isExpanded ? '▼' : '▶'}
                                </td>
                                <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>{m.version}</td>
                                <td>{formatLastAnalysed(m.date)}</td>
                                <td>
                                  <span style={{ 
                                    color: '#34d399', 
                                    backgroundColor: 'rgba(52, 211, 153, 0.1)', 
                                    padding: '0.1rem 0.5rem', 
                                    borderRadius: '4px',
                                    fontSize: '0.85rem'
                                  }}>
                                    {m.status}
                                  </span>
                                </td>
                                <td><code style={{ color: '#cbd5e1' }}>{m.gitTag}</code></td>
                                <td>
                                  <code style={{ color: '#94a3b8', fontSize: '0.8rem' }} title={m.commitHash}>
                                    {m.commitHash ? m.commitHash.substring(0, 8) : 'PENDING'}
                                  </code>
                                </td>
                                <td style={{ color: '#e2e8f0' }}>{m.summary}</td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan="7" style={{ backgroundColor: '#0f172a', padding: '1.5rem', borderBottom: '1px solid #334155' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#38bdf8', fontSize: '0.95rem' }}>Features Completed</h4>
                                          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.5' }}>
                                            {m.features.map((f, i) => (
                                              <li key={i}>{f}</li>
                                            ))}
                                            {m.features.length === 0 && <li style={{ fontStyle: 'italic', color: '#64748b' }}>None</li>}
                                          </ul>
                                        </div>
                                        <div>
                                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#f43f5e', fontSize: '0.95rem' }}>Bug Fixes</h4>
                                          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: '1.5' }}>
                                            {m.bugfixes.map((b, i) => (
                                              <li key={i}>{b}</li>
                                            ))}
                                            {m.bugfixes.length === 0 && <li style={{ fontStyle: 'italic', color: '#64748b' }}>None</li>}
                                          </ul>
                                        </div>
                                      </div>
                                      
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <div>
                                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#e2e8f0', fontSize: '0.95rem' }}>Developer Notes</h4>
                                          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                                            {m.notes || 'No developer notes provided.'}
                                          </p>
                                        </div>
                                        <div>
                                          <h4 style={{ margin: '0 0 0.5rem 0', color: '#f59e0b', fontSize: '0.95rem' }}>Rollback Information</h4>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                                            <div>
                                              <span style={{ color: '#94a3b8', marginRight: '6px' }}>Git Tag:</span>
                                              <code style={{ color: '#38bdf8' }}>{m.gitTag}</code>
                                            </div>
                                            <div>
                                              <span style={{ color: '#94a3b8', marginRight: '6px' }}>Commit Hash:</span>
                                              <code style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{m.commitHash}</code>
                                            </div>
                                            <div>
                                              <span style={{ color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>Rollback Command:</span>
                                              <div style={{
                                                backgroundColor: '#1e293b',
                                                padding: '0.5rem 0.75rem',
                                                borderRadius: '4px',
                                                border: '1px solid #334155',
                                                fontFamily: 'monospace',
                                                fontSize: '0.8rem',
                                                color: '#f8fafc',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                              }}>
                                                <code>git checkout {m.gitTag}</code>
                                                <button 
                                                  type="button"
                                                  onClick={() => {
                                                    navigator.clipboard.writeText(`git checkout ${m.gitTag}`);
                                                    alert('Rollback command copied!');
                                                  }}
                                                  style={{
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    color: '#38bdf8',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem',
                                                    textDecoration: 'underline'
                                                  }}
                                                >
                                                  Copy
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

        {currentView === 'analyse' && activeAnalysisItem && (
          <div className="analysis-container">
            <div className="analysis-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#ffffff' }}>Lead Opportunity Dashboard</h1>
                <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8' }}>{activeAnalysisItem.domain || activeAnalysisItem.url}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleRefreshAnalysis}
                  className="analyse-btn-green"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh Analysis'}
                </button>
                <button 
                  onClick={() => setCurrentView('search')} 
                  className="table-btn"
                  style={{ backgroundColor: '#475569' }}
                >
                  &larr; Back to Results
                </button>
              </div>
            </div>

            {/* Executive Summary Card */}
            <div className="analysis-section" style={{ marginBottom: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
              <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>Executive Summary</h3>
              
              {/* Metrics Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Search Information (Spans 2 columns if space allows) */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gridColumn: 'span 2' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>Search Information</span>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', width: '100%', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
                      <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Phrase:</span>
                      <span style={{ fontWeight: 'bold', color: '#60a5fa', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getSearchPhrase(activeAnalysisItem.searchKeyword, activeAnalysisItem.location)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
                      <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>URL:</span>
                      <span style={{ wordBreak: 'break-all', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeAnalysisItem.url ? (
                          <a href={activeAnalysisItem.url} target="_blank" rel="noopener noreferrer" className="table-link" style={{ fontSize: '0.85rem' }}>
                            {activeAnalysisItem.url}
                          </a>
                        ) : 'Not available'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }}>
                      <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>Analysed:</span>
                      <span style={{ color: '#cbd5e1', textAlign: 'right' }}>
                        {formatLastAnalysed(activeAnalysisItem.lastAnalysed)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lead Priority */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>Lead Priority</span>
                  <span style={{ fontSize: '1.25rem', color: '#f59e0b', fontWeight: 'bold', lineHeight: '1.2' }}>{activeAnalysisItem.leadPriority?.stars || '★★★☆☆'}</span>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>{activeAnalysisItem.leadPriority?.label || 'Good Lead'}</span>
                </div>

                {/* Google Business Profile Status */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>GBP Status</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: activeAnalysisItem.gbp?.status === 'Found' ? '#10b981' : (activeAnalysisItem.gbp?.status === 'Multiple Matches' ? '#f59e0b' : '#ef4444'), lineHeight: '1.2' }}>
                    {activeAnalysisItem.gbp?.status || 'Not Found'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>Google Business</span>
                </div>

                {/* Organic Ranking */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>Organic Ranking</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#38bdf8', lineHeight: '1.2' }}>
                    {activeAnalysisItem.rank ? `#${activeAnalysisItem.rank}` : 'Not available'}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>SERP Position</span>
                </div>
              </div>
            </div>

            <div className="analysis-grid">
              {/* Card 1: Lead Opportunity Score */}
              <div className="analysis-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <h3>Lead Opportunity Score</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: '1.25rem 0' }}>
                  <span style={{ fontSize: '4.5rem', fontWeight: '800', color: activeAnalysisItem.leadOpportunityScore?.score >= 80 ? '#ef4444' : (activeAnalysisItem.leadOpportunityScore?.score >= 60 ? '#f59e0b' : (activeAnalysisItem.leadOpportunityScore?.score >= 30 ? '#3b82f6' : '#10b981')), lineHeight: '1' }}>
                    {activeAnalysisItem.leadOpportunityScore?.score ?? 0}
                  </span>
                  <span style={{ 
                    marginTop: '0.75rem',
                    fontWeight: 'bold', 
                    fontSize: '1.05rem',
                    padding: '0.25rem 0.75rem', 
                    borderRadius: '20px', 
                    backgroundColor: activeAnalysisItem.leadOpportunityScore?.band === 'Very High' ? 'rgba(239, 68, 68, 0.2)' : (activeAnalysisItem.leadOpportunityScore?.band === 'High' ? 'rgba(245, 158, 11, 0.2)' : (activeAnalysisItem.leadOpportunityScore?.band === 'Moderate' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)')),
                    color: activeAnalysisItem.leadOpportunityScore?.band === 'Very High' ? '#ef4444' : (activeAnalysisItem.leadOpportunityScore?.band === 'High' ? '#f59e0b' : (activeAnalysisItem.leadOpportunityScore?.band === 'Moderate' ? '#3b82f6' : '#10b981'))
                  }}>
                    {activeAnalysisItem.leadOpportunityScore?.band || 'Low'} Opportunity
                  </span>
                </div>
              </div>

              {/* Card 2: Google Business Profile */}
              <div className="analysis-section">
                <h3>Google Business Profile</h3>
                <div className="analysis-row">
                  <span className="analysis-label">Profile Status</span>
                  <span className="analysis-value" style={{ 
                    fontWeight: 'bold', 
                    color: activeAnalysisItem.gbp?.status === 'Found' ? '#10b981' : (activeAnalysisItem.gbp?.status === 'Multiple Matches' ? '#f59e0b' : '#ef4444')
                  }}>
                    {activeAnalysisItem.gbp?.status || 'Not Found'}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Business Name</span>
                  <span className="analysis-value">{activeAnalysisItem.gbp?.businessName || 'Not Found'}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Primary Category</span>
                  <span className="analysis-value">{activeAnalysisItem.gbp?.primaryCategory || 'Not Found'}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Rating</span>
                  <span className="analysis-value" style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                    {activeAnalysisItem.gbp?.rating !== 'Not Found' && activeAnalysisItem.gbp?.rating !== undefined ? `★ ${activeAnalysisItem.gbp.rating}` : 'Not Found'}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Review Count</span>
                  <span className="analysis-value">{activeAnalysisItem.gbp?.reviewCount || 'Not Found'}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Website URL</span>
                  <span className="analysis-value" style={{ wordBreak: 'break-all', maxWidth: '100%', display: 'inline-block' }}>
                    {activeAnalysisItem.gbp?.websiteUrl && activeAnalysisItem.gbp?.websiteUrl !== 'Not Found' && activeAnalysisItem.gbp?.websiteUrl !== 'Multiple Matches' ? (
                      <a href={activeAnalysisItem.gbp.websiteUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                        {activeAnalysisItem.gbp.websiteUrl}
                      </a>
                    ) : (activeAnalysisItem.gbp?.websiteUrl || 'Not Found')}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Phone Number</span>
                  <span className="analysis-value">{activeAnalysisItem.gbp?.phoneNumber || 'Not Found'}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Address</span>
                  <span className="analysis-value" style={{ textAlign: 'right' }}>{activeAnalysisItem.gbp?.address || 'Not Found'}</span>
                </div>
              </div>

              {/* Card 3: Technical Analysis */}
              <div className="analysis-section" style={{ gridColumn: '1 / -1' }}>
                <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '0.75rem', marginBottom: '1.25rem' }}>Technical Analysis</h3>

                {/* Executive Overview */}
                <div style={{ marginBottom: '1.25rem', padding: '1.25rem', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Executive Overview</h4>
                  <p style={{ margin: 0, fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.5', fontWeight: '500' }}>
                    {activeAnalysisItem.aiReport?.execSummary ? (
                      activeAnalysisItem.aiReport.execSummary.split(/[.!?]/)[0] + '.'
                    ) : 'Website analysis and opportunity assessment complete.'}
                  </p>
                </div>

                {/* Top 5 Contributing Factors */}
                <div style={{ marginBottom: '1.5rem', padding: '1.25rem', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', color: '#cbd5e1', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top 5 Contributing Factors</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', lineHeight: '1.4' }}>
                    {(activeAnalysisItem.leadOpportunityScore?.reasons || []).map((reason, index) => (
                      <li key={index} style={{ color: '#cbd5e1' }}>{reason}</li>
                    ))}
                  </ul>
                </div>

                {/* Technical Indicators Grid */}
                <h4 style={{ margin: '1.5rem 0 0.75rem 0', color: '#cbd5e1', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Technical Indicators</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: '500' }}>HTTPS Secure</span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem',
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '4px',
                      color: activeAnalysisItem.seoHealth?.isHttps ? '#10b981' : '#ef4444',
                      backgroundColor: activeAnalysisItem.seoHealth?.isHttps ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    }}>
                      {activeAnalysisItem.seoHealth?.isHttps ? 'Pass' : 'Fail (HTTP)'}
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: '500' }}>HTTP Response Status</span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem',
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '4px',
                      color: activeAnalysisItem.seoHealth?.statusCode === 200 ? '#10b981' : '#ef4444',
                      backgroundColor: activeAnalysisItem.seoHealth?.statusCode === 200 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    }}>
                      {activeAnalysisItem.seoHealth?.statusCode === 200 ? 'Pass (200 OK)' : `Fail (${activeAnalysisItem.seoHealth?.statusCode || 'Error'})`}
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: '500' }}>Search Indexability</span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem',
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '4px',
                      color: activeAnalysisItem.seoHealth?.indexable ? '#10b981' : '#ef4444',
                      backgroundColor: activeAnalysisItem.seoHealth?.indexable ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    }}>
                      {activeAnalysisItem.seoHealth?.indexable ? 'Indexable' : 'Noindex'}
                    </span>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: '500' }}>Canonical Tag</span>
                    <span style={{ 
                      fontWeight: 'bold', 
                      fontSize: '0.85rem',
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '4px',
                      color: activeAnalysisItem.seoHealth?.hasCanonical ? '#10b981' : '#ef4444',
                      backgroundColor: activeAnalysisItem.seoHealth?.hasCanonical ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                    }}>
                      {activeAnalysisItem.seoHealth?.hasCanonical ? 'Present' : 'Missing'}
                    </span>
                  </div>
                </div>

                {/* Metadata Details */}
                <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid #334155', paddingTop: '1.5rem' }}>
                  <div style={{ backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '6px', border: '1px solid #334155' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#60a5fa', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meta Title</h4>
                    <div style={{ fontSize: '0.95rem', color: '#f8fafc', wordBreak: 'break-word', lineHeight: '1.5' }}>
                      {(!activeAnalysisItem.pageTitle || activeAnalysisItem.pageTitle === 'Not Found' || activeAnalysisItem.pageTitle === 'Loading...') ? (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Missing</span>
                      ) : activeAnalysisItem.pageTitle}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '6px', border: '1px solid #334155' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meta Description</h4>
                    <div style={{ fontSize: '0.95rem', color: '#f8fafc', wordBreak: 'break-word', lineHeight: '1.5' }}>
                      {(!activeAnalysisItem.metaDescription || activeAnalysisItem.metaDescription === 'Not Found' || activeAnalysisItem.metaDescription === 'Loading...') ? (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Missing</span>
                      ) : activeAnalysisItem.metaDescription}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '6px', border: '1px solid #334155' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#a78bfa', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>H1 Heading</h4>
                    <div style={{ fontSize: '0.95rem', color: '#f8fafc', wordBreak: 'break-word', lineHeight: '1.5' }}>
                      {(!activeAnalysisItem.h1 || activeAnalysisItem.h1 === 'Not Found' || activeAnalysisItem.h1 === 'Loading...') ? (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Missing</span>
                      ) : activeAnalysisItem.h1}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Outreach Strategy */}
              <div className="analysis-section" style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, border: 'none', padding: 0 }}>Outreach Strategy</h3>
                </div>

                {/* Contact Strategy */}
                <div style={{ marginBottom: '1.5rem', backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#60a5fa', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Strategy</h4>
                  <p style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    {getContactStrategySummary(activeAnalysisItem)}
                  </p>
                  
                  <h5 style={{ margin: '1rem 0 0.5rem 0', color: '#f59e0b', fontSize: '0.95rem', fontWeight: 'bold' }}>Key Talking Points</h5>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', lineHeight: '1.4' }}>
                    {getKeyTalkingPoints(activeAnalysisItem).map((point, index) => (
                      <li key={index}>{point.replace(/^•\s*/, '')}</li>
                    ))}
                  </ul>
                </div>

                {/* Suggested First Email */}
                <div style={{ backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '6px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Suggested First Email</h4>
                  <textarea
                    className="analysis-notes-area"
                    style={{ height: '280px', fontFamily: 'inherit', fontSize: '0.95rem', lineHeight: '1.5', marginTop: '0.5rem' }}
                    value={outreachEmail}
                    onChange={(e) => setOutreachEmail(e.target.value)}
                    placeholder="Generating first contact email..."
                  />
                </div>
              </div>

              {/* Card 5: Notes */}
              <div className="analysis-section" style={{ gridColumn: '1 / -1' }}>
                <h3>Notes</h3>
                <textarea
                  className="analysis-notes-area"
                  value={analysisNotes[activeAnalysisItem.url || activeAnalysisItem.domain] || ''}
                  onChange={(e) => handleNoteChange(activeAnalysisItem.url || activeAnalysisItem.domain, e.target.value)}
                  placeholder="Enter custom notes about this business or website here..."
                />
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default App
