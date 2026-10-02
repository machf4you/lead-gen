import re

file_path = r'c:\Antigravity\Lead Gen\client\src\App.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Define renderOriginalResultsView string
render_func = """
  const renderOriginalResultsView = (itemsToRender = searchResults) => {
    if (!Array.isArray(itemsToRender) || itemsToRender.length === 0) {
      return (
        <div className="results-table-container">
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>No results found for this search.</p>
          </div>
        </div>
      );
    }

    const allCount = itemsToRender.length;
    let followUpCount = 0;
    let averageCount = 0;
    let optimizedCount = 0;
    let wellOptimizedCount = 0;

    itemsToRender.forEach(item => {
      const s = item.opportunityScore ?? item.analysis?.leadOpportunityScore?.score;
      const rawBand = item.opportunityBand || item.analysis?.leadOpportunityScore?.band;
      const band = normalizeOpportunityClassification(rawBand, s);
      if (band === 'Follow-Up') followUpCount++;
      else if (band === 'Average') averageCount++;
      else if (band === 'Optimized') optimizedCount++;
      else if (band === 'Well-Optimized') wellOptimizedCount++;
    });

    const sortedResults = getSortedResults(itemsToRender);
    const filteredResults = classificationFilter === 'All'
      ? sortedResults
      : sortedResults.filter(item => {
          const s = item.opportunityScore ?? item.analysis?.leadOpportunityScore?.score;
          const rawBand = item.opportunityBand || item.analysis?.leadOpportunityScore?.band;
          const band = normalizeOpportunityClassification(rawBand, s);
          return band === classificationFilter;
        });

    const isAllRows = rowsPerPage === 'All';
    const pageSize = isAllRows ? (filteredResults.length || 1) : Number(rowsPerPage);
    const totalPages = isAllRows ? 1 : Math.max(1, Math.ceil(filteredResults.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const paginatedResults = isAllRows
      ? filteredResults
      : filteredResults.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
    const isOrganicResult = searchMode === 'organic';

    return (
      <>
        <div style={{
          width: '100%',
          maxWidth: '1440px',
          margin: '0 auto 0.75rem auto',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxSizing: 'border-box'
        }}>
          {/* Classification Filter Tabs: All | Follow-Up | Average | Optimized | Well-Optimized */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {[
              { key: 'All', label: 'All', count: allCount, color: '#38bdf8' },
              { key: 'Follow-Up', label: 'Follow-Up', count: followUpCount, color: '#eab308' },
              { key: 'Average', label: 'Average', count: averageCount, color: '#94a3b8' },
              { key: 'Optimized', label: 'Optimized', count: optimizedCount, color: '#38bdf8' },
              { key: 'Well-Optimized', label: 'Well-Optimized', count: wellOptimizedCount, color: '#10b981' }
            ].map(tab => {
              const isActive = classificationFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setClassificationFilter(tab.key);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? '700' : '500',
                    cursor: 'pointer',
                    border: isActive ? `1.5px solid ${tab.color}` : '1px solid #334155',
                    backgroundColor: isActive ? `${tab.color}22` : '#0f172a',
                    color: isActive ? (tab.key === 'Average' ? '#cbd5e1' : tab.color) : '#94a3b8',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.key !== 'All' && (
                    <span style={{ fontSize: '0.65rem', color: tab.color, lineHeight: '1' }}>●</span>
                  )}
                  <span>{tab.label} ({tab.count})</span>
                </button>
              );
            })}
          </div>

          {/* Rows Selector: Rows: 10 | 30 | 50 | All */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#94a3b8', fontWeight: '600' }}>
            <span style={{ marginRight: '0.2rem' }}>Rows:</span>
            {[10, 30, 50, 'All'].map(val => {
              const isSelected = rowsPerPage === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setRowsPerPage(val);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '5px',
                    fontSize: '0.82rem',
                    fontWeight: isSelected ? '700' : '500',
                    cursor: 'pointer',
                    border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                    backgroundColor: isSelected ? '#1e3a8a' : '#0f172a',
                    color: isSelected ? '#ffffff' : '#94a3b8',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {val}
                </button>
              );
            })}
          </div>
        </div>

        <div className="results-table-container">
          <table className="results-table">
            <thead>
              {isOrganicResult ? (
                <tr>
                  <th onClick={() => handleSort('position')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Position {renderSortIndicator('position')}
                  </th>
                  <th style={{ width: '60px', textAlign: 'center' }}>EMAIL</th>
                  <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Classification {renderSortIndicator('score')}
                  </th>
                  <th onClick={() => handleSort('domain')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Domain / URL {renderSortIndicator('domain')}
                  </th>
                  <th>Google Snippet</th>
                  <th className="action-cell">Action</th>
                </tr>
              ) : (
                <tr>
                  <th onClick={() => handleSort('position')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Position {renderSortIndicator('position')}
                  </th>
                  <th style={{ width: '60px', textAlign: 'center' }}>EMAIL</th>
                  <th onClick={() => handleSort('rating')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Rating {renderSortIndicator('rating')}
                  </th>
                  <th onClick={() => handleSort('score')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Classification {renderSortIndicator('score')}
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
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={isOrganicResult ? 6 : 9} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                    No prospects match the &ldquo;{classificationFilter}&rdquo; classification for this search.
                  </td>
                </tr>
              ) : (
                paginatedResults.map((item, index) => {
                  if (isOrganicResult) {
                    const isItemShortlisted = isShortlisted(item.domain || item.url);
                    return (
                      <tr key={index} style={isItemShortlisted ? { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderLeft: '4px solid #3b82f6' } : {}}>
                        <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>#{item.rank}</td>
                        <td style={{ textAlign: 'center', width: '60px' }}>
                          {item.contactEmail || (item.analysis && item.analysis.contactEmail) || item.emailStatus === 'Email Found' || (item.analysis && item.analysis.emailStatus === 'Email Found') ? (
                            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Verified email found">✓</span>
                          ) : item.emailStatus === 'No Email' || item.emailStatus === 'No Email Found' || (item.analysis && (item.analysis.emailStatus === 'No Email' || item.analysis.emailStatus === 'No Email Found')) ? (
                            <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="No verified email found">✗</span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.9rem' }}>-</span>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const s = item.opportunityScore ?? item.analysis?.leadOpportunityScore?.score;
                            const rawBand = item.opportunityBand || item.analysis?.leadOpportunityScore?.band;
                            if (s !== null && s !== undefined) {
                              const band = normalizeOpportunityClassification(rawBand, s);
                              const { color, bg, border } = getClassificationColors(band);
                              return (
                                <span style={{ 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  backgroundColor: bg,
                                  border: `1px solid ${border}`,
                                  color,
                                  fontSize: '0.82rem',
                                  fontWeight: '700',
                                  whiteSpace: 'nowrap'
                                }}>
                                  <span style={{ fontSize: '0.7rem', lineHeight: '1' }}>●</span>
                                  <span>{band}</span>
                                </span>
                              );
                            }
                            return <span style={{ color: '#64748b' }}>-</span>;
                          })()}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="table-link">
                            {item.domain}
                          </a>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: '#cbd5e1', maxWidth: '400px' }}>
                          <div style={{ fontWeight: '600', color: '#f8fafc', marginBottom: '2px' }}>
                            {renderTruncatedMetaValue(item.title, 70)}
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                            {renderTruncatedMetaValue(item.description, 100)}
                          </div>
                        </td>
                        <td className="action-cell">
                          <button 
                            onClick={() => handleAnalyse(item)} 
                            className="analyse-btn-green"
                            style={{ marginRight: '6px', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            View Analysis
                          </button>
                          {!isItemShortlisted ? (
                            <button 
                              onClick={() => handleAddToOutreach(item)} 
                              className="table-btn"
                              style={{ backgroundColor: '#2563eb', padding: '0.3rem 0.65rem', fontSize: '0.8rem', marginRight: '6px' }}
                            >
                              + Shortlist
                            </button>
                          ) : (
                            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.8rem', marginRight: '6px' }}>✓ Shortlisted</span>
                          )}
                          <button 
                            onClick={() => handleOpenExclusionsModal(item.domain)} 
                            className="table-btn"
                            style={{ backgroundColor: '#ef4444', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            Exclude
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // GMB Row
                  const isItemShortlisted = isShortlisted(item.website || item.name);
                  return (
                    <tr key={index} style={isItemShortlisted ? { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderLeft: '4px solid #3b82f6' } : {}}>
                      <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>#{item.rank}</td>
                      <td style={{ textAlign: 'center', width: '60px' }}>
                        {item.contactEmail || (item.analysis && item.analysis.contactEmail) || item.emailStatus === 'Email Found' || (item.analysis && item.analysis.emailStatus === 'Email Found') ? (
                          <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Verified email found">✓</span>
                        ) : item.emailStatus === 'No Email' || item.emailStatus === 'No Email Found' || (item.analysis && (item.analysis.emailStatus === 'No Email' || item.analysis.emailStatus === 'No Email Found')) ? (
                          <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="No verified email found">✗</span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>-</span>
                        )}
                      </td>
                      <td>
                        {item.rating !== null && item.rating !== undefined ? (
                          <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                            ⭐ {item.rating} <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'normal' }}>({item.reviewsCount || 0})</span>
                          </span>
                        ) : <span style={{ color: '#64748b' }}>-</span>}
                      </td>
                      <td>
                        {(() => {
                          const s = item.opportunityScore ?? item.analysis?.leadOpportunityScore?.score;
                          const rawBand = item.opportunityBand || item.analysis?.leadOpportunityScore?.band;
                          if (s !== null && s !== undefined) {
                            const band = normalizeOpportunityClassification(rawBand, s);
                            const { color, bg, border } = getClassificationColors(band);
                            return (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                backgroundColor: bg,
                                border: `1px solid ${border}`,
                                color,
                                fontSize: '0.82rem',
                                fontWeight: '700',
                                whiteSpace: 'nowrap'
                              }}>
                                <span style={{ fontSize: '0.7rem', lineHeight: '1' }}>●</span>
                                <span>{band}</span>
                              </span>
                            );
                          }
                          return <span style={{ color: '#64748b' }}>-</span>;
                        })()}
                      </td>
                      <td style={{ fontWeight: 'bold', color: '#ffffff' }}>{item.name}</td>
                      <td>
                        {item.website ? (
                          <a href={item.website} target="_blank" rel="noopener noreferrer" className="table-link">
                            {getDomain(item.website)}
                          </a>
                        ) : <span style={{ color: '#64748b' }}>-</span>}
                      </td>
                      <td>{item.phone || '-'}</td>
                      <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{renderTruncatedMetaValue(item.address, 60)}</td>
                      <td className="action-cell">
                        <button 
                          onClick={() => handleAnalyse(item)} 
                          className="analyse-btn-green"
                          style={{ marginRight: '6px', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                        >
                          View Analysis
                        </button>
                        {!isItemShortlisted ? (
                          <button 
                            onClick={() => handleAddToOutreach(item)} 
                            className="table-btn"
                            style={{ backgroundColor: '#2563eb', padding: '0.3rem 0.65rem', fontSize: '0.8rem', marginRight: '6px' }}
                          >
                            + Shortlist
                          </button>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.8rem', marginRight: '6px' }}>✓ Shortlisted</span>
                        )}
                        <button 
                          onClick={() => handleOpenExclusionsModal(item.website ? getDomain(item.website) : item.name)} 
                          className="table-btn"
                          style={{ backgroundColor: '#ef4444', padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                        >
                          Exclude
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isAllRows && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '2rem' }}>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
              disabled={safeCurrentPage === 1}
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
                  backgroundColor: safeCurrentPage === page ? '#3b82f6' : '#1e3a8a',
                  border: '1px solid #334155',
                  color: '#ffffff'
                }}
              >
                {page}
              </button>
            ))}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
              disabled={safeCurrentPage === totalPages}
              className="table-btn"
              style={{ padding: '0.5rem 1rem' }}
            >
              Next
            </button>
          </div>
        )}
      </>
    );
  };
"""

# Insert render_func before `return (` in App
content = content.replace('  return (\n    <>\n      <div className="app-container">', render_func + '\n  return (\n    <>\n      <div className="app-container">')

# Replace inline search results block in currentView === 'search'
old_search_block = """            {Array.isArray(searchResults) && searchResults.length > 0 && (() => {"""
# Find from old_search_block to the end of that IIFE
start_idx = content.find(old_search_block)
if start_idx != -1:
    end_idx = content.find("})()}\n          </>", start_idx) + len("})()}\n          </>")
    if end_idx != -1:
        content = content[:start_idx] + "{renderOriginalResultsView(searchResults)}" + content[end_idx:]

# Replace Results tab block inside Saved Search Workspace
old_workspace_results = """              {/* View 1: Results View */}
              {savedWorkspaceTab === 'results' && (
                <div className="results-table-container">"""

start_ws = content.find(old_workspace_results)
if start_ws != -1:
    end_ws = content.find("              )}\n\n              {/* View 2: Shortlist View */}", start_ws)
    if end_ws != -1:
        new_ws = """              {/* View 1: Results View */}
              {savedWorkspaceTab === 'results' && (
                renderOriginalResultsView(activeSavedSearch?.data || searchResults)
              )}"""
        content = content[:start_ws] + new_ws + content[end_ws + len("              )}")]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactoring complete!")
