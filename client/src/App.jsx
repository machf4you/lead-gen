import { useState, useEffect } from 'react'
import './App.css'
import GlobalDeploymentIndicator from './components/GlobalDeploymentIndicator'

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

const normalizeDomain = (urlOrDomain) => {
  if (!urlOrDomain) return '';
  let str = String(urlOrDomain).trim().toLowerCase();
  if (str.includes('://')) {
    try {
      str = new URL(str).hostname;
    } catch (e) {
      str = str.replace(/^https?:\/\//i, '').split('/')[0];
    }
  } else {
    str = str.split('/')[0].split('?')[0];
  }
  return str.replace(/^www\./i, '').trim();
};

const GENERIC_LOCAL_PARTS = new Set([
  'hello', 'info', 'sales', 'contact', 'enquiries', 'enquiry', 'office',
  'admin', 'support', 'team', 'bookings', 'booking', 'help', 'marketing',
  'press', 'media', 'mail', 'service', 'services', 'billing', 'accounts',
  'account', 'general', 'customercare', 'customerservice', 'webmaster',
  'postmaster', 'hostmaster', 'feedback', 'jobs', 'careers', 'reception',
  'orders', 'queries', 'query'
]);

const isDomainMatch = (email, prospectDomain) => {
  if (!email || !prospectDomain) return false;
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return false;
  const emailDomain = email.substring(atIndex + 1).toLowerCase().trim();
  const cleanProspectDomain = normalizeDomain(prospectDomain).toLowerCase().trim();
  
  if (emailDomain === cleanProspectDomain || emailDomain.endsWith('.' + cleanProspectDomain)) {
    return true;
  }
  
  // Stem match (e.g. astonlily vs astonlilyshutters)
  const prospectStem = cleanProspectDomain.split('.')[0].replace(/[^a-z0-9]/gi, '');
  const emailStem = emailDomain.split('.')[0].replace(/[^a-z0-9]/gi, '');
  if (prospectStem.length >= 4 && emailStem.length >= 4) {
    if (emailStem.includes(prospectStem) || prospectStem.includes(emailStem)) {
      const blockedAgencies = ['jaedigital.co.uk', 'wordpress.org', 'wixpress.com', 'squarespace.com', 'shopify.com'];
      if (!blockedAgencies.some(b => emailDomain === b || emailDomain.endsWith('.' + b))) {
        return true;
      }
    }
  }

  return false;
};

const deriveFirstName = (email) => {
  if (!email) return null;
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return null;
  const localPart = email.substring(0, atIndex).toLowerCase().trim();

  if (GENERIC_LOCAL_PARTS.has(localPart)) return null;

  const parts = localPart.split(/[._-]/).filter(Boolean);
  const candidate = parts[0];

  if (/^[a-z]{2,20}$/i.test(candidate) && !GENERIC_LOCAL_PARTS.has(candidate.toLowerCase())) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
  }
  return null;
};

const deriveGreeting = (email, prospect) => {
  const firstName = deriveFirstName(email);
  if (firstName) {
    return `Hi ${firstName},`;
  }
  return 'Hi there,';
};

const stripLeadingGreeting = (body) => {
  if (!body) return '';
  let cleaned = body;
  const greetingPattern = /^\s*(?:(?:Hi|Hello|Hey|Dear)\b[^\n]*|\{\{\s*(?:greeting|firstName|businessName)\s*\}\}[^\n]*)(?:\r?\n)+/i;
  while (greetingPattern.test(cleaned)) {
    cleaned = cleaned.replace(greetingPattern, '');
  }
  return cleaned.trimStart();
};

const deriveLocation = (prospect) => {
  if (!prospect) return 'your area';
  const loc = (typeof prospect === 'string' ? prospect : (prospect.location || '')).trim();
  if (!loc || loc.toLowerCase() === 'anywhere' || loc.toLowerCase() === 'not available') {
    return 'your area';
  }
  return loc;
};

const deriveTrade = (prospect) => {
  if (!prospect) return 'services';

  let rawTrade = '';
  if (typeof prospect === 'string') {
    rawTrade = prospect.trim();
  } else {
    // 1. Check explicit trade / businessType / searchKeyword
    rawTrade = (prospect.trade || prospect.businessType || prospect.searchKeyword || '').trim();

    // 2. Check searchPhrase if rawTrade is empty
    if (!rawTrade && prospect.searchPhrase) {
      rawTrade = (prospect.searchPhrase || '').trim();
    }

    // 3. Check analysisData if available
    if (!rawTrade && prospect.analysisData) {
      rawTrade = (prospect.analysisData.trade || prospect.analysisData.businessType || prospect.analysisData.searchKeyword || '').trim();
    }
  }

  if (!rawTrade || rawTrade.toLowerCase() === 'any' || rawTrade.toLowerCase() === 'not available') {
    return 'services';
  }

  // If rawTrade contains or ends with the location, strip the location portion out
  const loc = (typeof prospect === 'object' && prospect ? prospect.location : '') || '';
  const cleanLoc = loc.trim();
  if (cleanLoc && cleanLoc.toLowerCase() !== 'anywhere' && cleanLoc.toLowerCase() !== 'your area') {
    const escapedLoc = cleanLoc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexEnd = new RegExp(`\\s+${escapedLoc}$`, 'i');
    rawTrade = rawTrade.replace(regexEnd, '').trim();
    const regexStart = new RegExp(`^${escapedLoc}\\s+`, 'i');
    rawTrade = rawTrade.replace(regexStart, '').trim();
  }

  return rawTrade || 'services';
};

// Helper to render template variables for a specific prospect
const renderTemplate = (templateStr, prospect, recipientEmail = null, senderSettings = null) => {
  if (!templateStr) return '';
  const email = recipientEmail || prospect?.contactEmail || (prospect?.allFoundEmails?.[0]) || '';
  const greeting = deriveGreeting(email, prospect);
  const firstName = deriveFirstName(email) || 'there';
  const businessName = prospect?.businessName || prospect?.name || prospect?.domain || '';
  const domain = prospect?.domain || '';
  const location = deriveLocation(prospect);
  const trade = deriveTrade(prospect);

  const senderFirstName = senderSettings?.sender_first_name || 'Mac';
  const senderName = senderSettings?.sender_name || 'Mac McCarthy';
  const companyName = senderSettings?.company_name || 'The Search Equation';

  const phone = prospect?.phone || '';
  const rating = prospect?.rating !== null && prospect?.rating !== undefined ? prospect.rating : '';

  return templateStr
    .replace(/Hi\s+\{\{\s*businessName\s*\}\}\s+Team,?\s*/gi, `${greeting}\n\n`)
    .replace(/Hi\s+\{\{\s*businessName\s*\}\},?\s*/gi, `${greeting}\n\n`)
    .replace(/Hi\s+\{\{\s*firstName\s*\}\},?/gi, greeting)
    .replace(/\{\{\s*greeting\s*\}\}/gi, greeting)
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*businessName\s*\}\}/gi, businessName)
    .replace(/\{\{\s*domain\s*\}\}/gi, domain)
    .replace(/\{\{\s*location\s*\}\}/gi, location)
    .replace(/\{\{\s*trade\s*\}\}/gi, trade)
    .replace(/\{\{\s*businessType\s*\}\}/gi, trade)
    .replace(/\{\{\s*searchPhrase\s*\}\}/gi, trade)
    .replace(/\{\{\s*searchKeyword\s*\}\}/gi, trade)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*rating\s*\}\}/gi, String(rating))
    .replace(/\{\{\s*(?:sender_first_name|senderFirstName)\s*\}\}/gi, senderFirstName)
    .replace(/\{\{\s*(?:sender_name|senderName)\s*\}\}/gi, senderName)
    .replace(/\{\{\s*(?:company_name|companyName)\s*\}\}/gi, companyName);
};

// Helper to render the complete email body with automatic separate greeting prepended
const renderFullEmailBody = (templateBody, prospect, recipientEmail = null, senderSettings = null) => {
  const email = recipientEmail || prospect?.contactEmail || (prospect?.allFoundEmails?.[0]) || '';
  const greeting = deriveGreeting(email, prospect);
  const cleanBody = stripLeadingGreeting(templateBody || '');
  const renderedBody = renderTemplate(cleanBody, prospect, email, senderSettings);
  return `${greeting}\n\n${renderedBody}`.trim();
};

// Helper for demonstration preview in Email Templates view
const renderTemplateDemoPreview = (text, workspace = 'tse') => {
  if (!text) return '';
  const isChili = workspace === 'smoking_chili';
  const senderName = isChili ? 'Darren' : 'Mac McCarthy';
  const senderFirstName = isChili ? 'Darren' : 'Mac';
  const companyName = isChili ? 'Smoking Chili Media' : 'The Search Equation';
  const trade = 'Window Shutters';
  const location = 'London';
  const domain = 'londonshutters.co.uk';
  const businessName = 'London Shutters Ltd';
  const firstName = 'John';
  const phone = '020 7946 0123';
  const rating = '4.9';

  return text
    .replace(/\{\{\s*(?:sender_first_name|senderFirstName)\s*\}\}/gi, senderFirstName)
    .replace(/\{\{\s*(?:sender_name|senderName)\s*\}\}/gi, senderName)
    .replace(/\{\{\s*(?:company_name|companyName|company)\s*\}\}/gi, companyName)
    .replace(/\{\{\s*(?:trade|businessType|searchPhrase|searchKeyword)\s*\}\}/gi, trade)
    .replace(/\{\{\s*location\s*\}\}/gi, location)
    .replace(/\{\{\s*domain\s*\}\}/gi, domain)
    .replace(/\{\{\s*(?:businessName|business_name)\s*\}\}/gi, businessName)
    .replace(/\{\{\s*(?:firstName|first_name)\s*\}\}/gi, firstName)
    .replace(/\{\{\s*greeting\s*\}\}/gi, `Hi ${firstName}`)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone)
    .replace(/\{\{\s*rating\s*\}\}/gi, rating);
};

// Helper to sort templates by their numbered prefix
const sortTemplatesNumbered = (templates) => {
  return [...(templates || [])].sort((a, b) => {
    const numA = parseInt((a.name || '').match(/\(?(\d+)\)?/)?.[1] || '999', 10);
    const numB = parseInt((b.name || '').match(/\(?(\d+)\)?/)?.[1] || '999', 10);
    if (numA !== numB) return numA - numB;
    return (a.name || '').localeCompare(b.name || '');
  });
};

// Organic Templates
const generatePartnershipTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });

  const subject = `Partnership enquiry: ${trade} in ${loc} — {{company_name}}`;
  
  const body = `I hope you're having a productive week.

I'm reaching out directly because we are currently looking to partner with an established ${trade} company in ${loc} to generate and deliver additional high-intent client enquiries.

At {{company_name}}, we specialise in SEO and digital growth. Rather than offering standard marketing or agency retainers, our model is to invest our own time and digital expertise directly into driving exclusive customer enquiries for a single trusted partner in each sector and region.

We came across {{domain}} while researching established providers in ${loc}, and thought there could be strong commercial synergy between what you do and our growth framework.

If you have capacity for additional ${trade} projects and are open to exploring a collaborative partnership, I’d be glad to share a quick overview of how we work.

Would you be open to a brief 5-minute conversation next week?

Best regards,

{{sender_name}}
{{company_name}}`;

  return { subject, body };
};

const generateOrganicStandardShortTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });
  const subject = `Quick question regarding search visibility for {{domain}}`;
  const body = `I was researching local ${trade} providers in ${loc} and noticed {{domain}} ranking in Google search results.

You have a strong foundation, but there are a few straightforward technical and local search adjustments that would significantly increase your direct customer enquiries.

I've put together a brief checklist of the highest-impact opportunities for your site. Would it be alright if I sent that over?

Best regards,

{{sender_name}}
{{company_name}}`;
  return { subject, body };
};

const generateOrganicPartnershipShortTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });
  const subject = `Partnership enquiry for {{domain}} — {{company_name}}`;
  const body = `I'm reaching out because we are looking to partner with an established ${trade} company in ${loc} to deliver exclusive customer enquiries.

At {{company_name}}, we invest our own resources into driving qualified client enquiries for one trusted partner per area.

We noticed {{domain}} and thought there could be strong synergy. If you have capacity for more ${trade} work, would you be open to a quick 5-minute chat next week?

Best regards,

{{sender_name}}
{{company_name}}`;
  return { subject, body };
};

// Local Business Listings Templates
const generateLocalPartnershipTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });

  const subject = `Partnership enquiry: ${trade} in ${loc} — {{company_name}}`;
  const body = `I hope you're having a productive week.

I'm reaching out directly because we are currently looking to partner with an established ${trade} specialist in ${loc} to generate and deliver additional direct customer enquiries.

At {{company_name}}, we work with high-performing local service businesses to maximise their Google Business Profile and local search visibility. Rather than offering standard marketing retainers or agency contracts, our model is to invest our own expertise directly into driving exclusive customer enquiries for a single trusted partner in each local area.

We noticed {{businessName}} while reviewing local providers in ${loc}, and your strong local presence and customer reputation stood out.

If you have capacity for additional ${trade} work in ${loc} and are open to exploring a commercial partnership, I’d be glad to share a quick overview of how we operate.

Would you be open to a brief 5-minute conversation next week?

Best regards,

{{sender_name}}
{{company_name}}`;

  return { subject, body };
};

const generateLocalStandardShortTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });

  const subject = `Quick question regarding local visibility for {{businessName}} in ${loc}`;
  const body = `I came across {{businessName}} while reviewing local ${trade} businesses in ${loc}.

You have a solid local presence, but there are a few straightforward optimizations to your Google Business Profile and local visibility that could significantly increase your incoming customer enquiries from Google Maps.

I’ve put together a brief checklist of the highest-impact opportunities for {{businessName}} in ${loc}. Would it be alright if I sent that over for you to take a look?

Best regards,

{{sender_name}}
{{company_name}}`;

  return { subject, body };
};

const generateLocalPartnershipShortTemplate = ({ searchKeyword, location, trade: explicitTrade } = {}) => {
  const loc = deriveLocation({ location });
  const trade = deriveTrade({ trade: explicitTrade, searchKeyword, location });

  const subject = `Exclusive ${trade} partner in ${loc} — {{businessName}}`;
  const body = `I'm reaching out because we are currently looking for a single trusted ${trade} company in ${loc} to partner with.

At {{company_name}}, we invest our own resources into driving exclusive local customer enquiries for one partner per trade and region.

We came across {{businessName}} and thought you would be an ideal fit. If you currently have capacity for more enquiries in ${loc}, would you be open to a brief 5-minute chat next week to see if there's synergy?

Best regards,

{{sender_name}}
{{company_name}}`;

  return { subject, body };
};

// Helper to classify template based on LOCAL - / ORGANIC - prefix or stored type
export const getTemplateClassification = (t) => {
  if (!t) return 'master';
  const name = (t.name || '').trim().toLowerCase();
  if (name.startsWith('local -') || name.startsWith('local-') || name.startsWith('local:')) return 'local';
  if (name.startsWith('organic -') || name.startsWith('organic-') || name.startsWith('organic:')) return 'organic';
  if (name.startsWith('master -') || name.startsWith('master-') || name.startsWith('master:')) return 'master';
  if (t.templateType === 'local') return 'local';
  if (t.templateType === 'organic') return 'organic';
  if (t.templateType === 'master') return 'master';
  if (t.id?.startsWith('tpl_local') || name.includes('(local)')) return 'local';
  if (t.id?.startsWith('tpl_organic') || name.includes('(organic)')) return 'organic';
  return 'master';
};

const renderTemplateOptions = (templates, placeholder = '-- Select Template --') => {
  const local = (templates || []).filter(t => getTemplateClassification(t) === 'local');
  const organic = (templates || []).filter(t => getTemplateClassification(t) === 'organic');
  const master = (templates || []).filter(t => getTemplateClassification(t) === 'master');

  return (
    <>
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {local.length > 0 && (
        <optgroup label="📍 Local Business Listings Templates (GBP / Google Maps)">
          {local.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </optgroup>
      )}
      {organic.length > 0 && (
        <optgroup label="🌐 Google Organic SERP Templates">
          {organic.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </optgroup>
      )}
      {master.length > 0 && (
        <optgroup label="General / Master Templates">
          {master.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </optgroup>
      )}
    </>
  );
};

const isPackLocal = (pack) => {
  if (!pack) return false;
  if (typeof pack === 'string') {
    return pack.startsWith('GM');
  }
  if (pack.packId?.startsWith('GM')) return true;
  if (pack.searchType === 'GMB' || pack.searchType === 'local') return true;
  if (pack.prospects && Array.isArray(pack.prospects)) {
    return pack.prospects.some(p => p.searchType === 'GMB' || p.searchType === 'local');
  }
  if (pack.templateId?.startsWith('tpl_local') || pack.name?.toLowerCase().includes('(local)')) return true;
  return false;
};

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:5000' : '';

const isDomainExcluded = (urlOrDomain, excludedList) => {
  if (!urlOrDomain || !excludedList || !Array.isArray(excludedList) || excludedList.length === 0) return false;
  const target = normalizeDomain(urlOrDomain);
  if (!target) return false;

  return excludedList.some(exc => {
    const excNorm = normalizeDomain(exc);
    if (!excNorm) return false;
    if (target === excNorm) return true;
    if (target.endsWith('.' + excNorm)) return true;
    if (excNorm.endsWith('.' + target)) return true;
    return false;
  });
};

const getDomain = (url) => {
  return normalizeDomain(url);
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
  const [excludedDomains, setExcludedDomains] = useState([]);
  const [outreachList, setOutreachList] = useState([]);
  const [isOutreachLoading, setIsOutreachLoading] = useState(false);
  const [outreachPacks, setOutreachPacks] = useState([]);
  const [isPacksLoading, setIsPacksLoading] = useState(false);
  const [activePack, setActivePack] = useState(null);
  const [outreachSubView, setOutreachSubView] = useState('shortlist'); // 'shortlist' | 'packs' | 'pack-detail'
  const [selectedShortlistIds, setSelectedShortlistIds] = useState(new Set());
  const [selectedProspectIdsInPack, setSelectedProspectIdsInPack] = useState(new Set());
  const [isFindingContacts, setIsFindingContacts] = useState(false);
  const [searchingProspectIds, setSearchingProspectIds] = useState(new Set());
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplateSubject, setEditingTemplateSubject] = useState('');
  const [editingTemplateBody, setEditingTemplateBody] = useState('');
  const [contactHistory, setContactHistory] = useState([]);
  const [newPackNameInput, setNewPackNameInput] = useState('');
  const [newPackTemplateId, setNewPackTemplateId] = useState('');
  const [newPackSubjectInput, setNewPackSubjectInput] = useState('');
  const [newPackBodyInput, setNewPackBodyInput] = useState('');
  const [isCreatingPackModalOpen, setIsCreatingPackModalOpen] = useState(false);
  const [senderStatus, setSenderStatus] = useState({ configured: false, senderMailbox: null });
  const [isSendConfirmModalOpen, setIsSendConfirmModalOpen] = useState(false);
  const [isSendingPack, setIsSendingPack] = useState(false);
  const [sendErrorMsg, setSendErrorMsg] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewRecipientIndex, setPreviewRecipientIndex] = useState(0);
  const [editingProspectId, setEditingProspectId] = useState(null);
  const [editingEmailValue, setEditingEmailValue] = useState('');

  // Master Email Templates state
  const [masterTemplates, setMasterTemplates] = useState([]);
  const [templateTab, setTemplateTab] = useState('master'); // 'master' | 'organic' | 'local'
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [isTemplateEditorModalOpen, setIsTemplateEditorModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [templateTypeInput, setTemplateTypeInput] = useState('organic'); // 'organic' | 'local' | 'master'
  const [templateSubjectInput, setTemplateSubjectInput] = useState('');
  const [templateBodyInput, setTemplateBodyInput] = useState('');
  const [selectedMasterTemplateIdForPack, setSelectedMasterTemplateIdForPack] = useState('');

  // Current authenticated user & workspace (persists instantly across page/view navigation)
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tse_leadgen_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      workspace: 'tse',
      workspaceLabel: 'The Search Equation',
      username: 'mac'
    };
  });

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/me`);
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
        try {
          localStorage.setItem('tse_leadgen_user', JSON.stringify(data));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  };

  // Outreach Sender Details state
  const [senderSettings, setSenderSettings] = useState({
    sender_first_name: 'Mac',
    sender_name: 'Mac McCarthy',
    company_name: 'The Search Equation'
  });
  const [isSavingSenderSettings, setIsSavingSenderSettings] = useState(false);
  const [senderSettingsSavedMsg, setSenderSettingsSavedMsg] = useState(false);

  const fetchSenderSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/sender`);
      if (res.ok) {
        const data = await res.json();
        setSenderSettings(data);
      }
    } catch (err) {
      console.error('Error fetching sender settings:', err);
    }
  };

  const handleSaveSenderSettings = async (e) => {
    if (e) e.preventDefault();
    setIsSavingSenderSettings(true);
    setSenderSettingsSavedMsg(false);
    try {
      const res = await fetch(`${API_BASE}/api/settings/sender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(senderSettings)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setSenderSettings(data.settings);
        setSenderSettingsSavedMsg(true);
        setTimeout(() => setSenderSettingsSavedMsg(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save sender settings');
      }
    } catch (err) {
      console.error('Error saving sender settings:', err);
      alert('Error saving sender settings: ' + err.message);
    } finally {
      setIsSavingSenderSettings(false);
    }
  };

  const fetchEmailTemplates = async () => {
    setIsTemplatesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/email-templates`);
      if (res.ok) {
        const list = await res.json();
        setMasterTemplates(list);
      }
    } catch (err) {
      console.error('Error fetching master email templates:', err);
    } finally {
      setIsTemplatesLoading(false);
    }
  };

  const handleOpenCreateTemplateModal = () => {
    setEditingTemplate(null);
    setTemplateNameInput('');
    setTemplateTypeInput(templateTab === 'local' ? 'local' : templateTab === 'organic' ? 'organic' : 'organic');
    setTemplateSubjectInput('');
    setTemplateBodyInput('');
    setIsTemplateEditorModalOpen(true);
  };

  const handleOpenEditTemplateModal = (tpl) => {
    setEditingTemplate(tpl);
    setTemplateNameInput(tpl.name || '');
    setTemplateTypeInput(getTemplateClassification(tpl));
    setTemplateSubjectInput(tpl.subject || '');
    setTemplateBodyInput(tpl.body || '');
    setIsTemplateEditorModalOpen(true);
  };

  const handleSaveTemplateSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!templateNameInput.trim() || !templateSubjectInput.trim() || !templateBodyInput.trim()) {
      alert('Please fill in the Template Name, Subject, and Email Body.');
      return;
    }

    const trimmedName = templateNameInput.trim();
    const lowerName = trimmedName.toLowerCase();
    let computedType = templateTypeInput;
    if (lowerName.startsWith('local -') || lowerName.startsWith('local-') || lowerName.startsWith('local:')) {
      computedType = 'local';
    } else if (lowerName.startsWith('organic -') || lowerName.startsWith('organic-') || lowerName.startsWith('organic:')) {
      computedType = 'organic';
    } else if (lowerName.startsWith('master -') || lowerName.startsWith('master-')) {
      computedType = 'master';
    }

    try {
      const url = editingTemplate 
        ? `${API_BASE}/api/email-templates/${encodeURIComponent(editingTemplate.id)}`
        : `${API_BASE}/api/email-templates`;
      const method = editingTemplate ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          templateType: computedType,
          subject: templateSubjectInput.trim(),
          body: templateBodyInput.trim()
        })
      });

      if (res.ok) {
        await fetchEmailTemplates();
        setIsTemplateEditorModalOpen(false);
        setEditingTemplate(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to save template');
      }
    } catch (err) {
      console.error('Error saving template:', err);
      alert('Error saving template: ' + err.message);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this master email template?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/email-templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchEmailTemplates();
      }
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const handleApplyMasterTemplateToPack = async (templateId) => {
    const tpl = masterTemplates.find(t => t.id === templateId);
    if (!tpl || !activePack) return;

    setSelectedMasterTemplateIdForPack(templateId);
    await handleUpdatePack(activePack.packId, {
      templateSubject: tpl.subject,
      templateBody: tpl.body
    });
  };

  const openTemplateModal = () => {
    if (!activePack) return;
    const firstPhrase = activePack.prospects?.[0]?.searchPhrase || activePack.prospects?.[0]?.searchKeyword || '';
    const firstLoc = activePack.prospects?.[0]?.location || '';
    const isLocalPack = activePack.prospects?.some(p => p.searchType === 'GMB' || p.searchType === 'local');
    const defaultTpl = isLocalPack
      ? generateLocalPartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc })
      : generatePartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc });

    const subject = (activePack.templateSubject && activePack.templateSubject.trim())
      ? activePack.templateSubject
      : defaultTpl.subject;
    const body = (activePack.templateBody && activePack.templateBody.trim())
      ? stripLeadingGreeting(activePack.templateBody)
      : stripLeadingGreeting(defaultTpl.body);

    setEditingTemplateSubject(subject);
    setEditingTemplateBody(body);
    setIsTemplateModalOpen(true);
  };

  useEffect(() => {
    if (isTemplateModalOpen && activePack) {
      const firstPhrase = activePack.prospects?.[0]?.searchPhrase || activePack.prospects?.[0]?.searchKeyword || '';
      const firstLoc = activePack.prospects?.[0]?.location || '';
      const isLocalPack = activePack.prospects?.some(p => p.searchType === 'GMB' || p.searchType === 'local');
      const defaultTpl = isLocalPack
        ? generateLocalPartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc })
        : generatePartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc });

      const subject = (activePack.templateSubject && activePack.templateSubject.trim())
        ? activePack.templateSubject
        : defaultTpl.subject;
      const body = (activePack.templateBody && activePack.templateBody.trim())
        ? stripLeadingGreeting(activePack.templateBody)
        : stripLeadingGreeting(defaultTpl.body);

      setEditingTemplateSubject(subject);
      setEditingTemplateBody(body);
    }
  }, [isTemplateModalOpen, activePack?.templateSubject, activePack?.templateBody]);

  const getSelectedRecipientsList = () => {
    if (!activePack) return [];
    const selectedProspects = activePack.prospects?.filter(p => selectedProspectIdsInPack.has(p.id || p.domain)) || [];
    const recipients = [];
    selectedProspects.forEach(p => {
      // If contactEmail is manually entered/saved, use it directly; otherwise look up matching domain email
      const email = p.contactEmail || (p.allFoundEmails?.find(em => isDomainMatch(em, p.domain))) || null;
      if (email) {
        recipients.push({
          prospect: p,
          domain: p.domain,
          email: email,
          subject: renderTemplate(activePack.templateSubject, p, email, senderSettings),
          body: renderFullEmailBody(activePack.templateBody, p, email, senderSettings),
          greeting: deriveGreeting(email, p)
        });
      } else {
        recipients.push({
          prospect: p,
          domain: p.domain,
          email: null,
          subject: renderTemplate(activePack.templateSubject, p, null, senderSettings),
          body: renderFullEmailBody(activePack.templateBody, p, null, senderSettings),
          greeting: deriveGreeting(null, p)
        });
      }
    });
    return recipients;
  };

  useEffect(() => {
    if (isSendConfirmModalOpen) {
      fetchSenderStatus();
    }
  }, [isSendConfirmModalOpen]);

  const fetchSenderStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/outreach/sender-status`);
      if (res.ok) {
        const data = await res.json();
        setSenderStatus(data);
      }
    } catch (e) {
      console.error("Error fetching sender status:", e);
    }
  };

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  };

  const handleOpenCreatePackModal = () => {
    const selectedProspects = outreachList.filter(item => selectedShortlistIds.has(item.id || item.domain));
    const phrases = [...new Set(selectedProspects.map(p => (p.searchPhrase || p.searchKeyword || '').trim()).filter(Boolean))];
    const locations = [...new Set(selectedProspects.map(p => (p.location || '').trim()).filter(Boolean))];

    let defaultName = '';
    if (phrases.length === 1 && locations.length === 1 && locations[0] !== 'Anywhere') {
      if (phrases[0].toLowerCase().includes(locations[0].toLowerCase())) {
        defaultName = toTitleCase(phrases[0].trim());
      } else {
        defaultName = `${toTitleCase(phrases[0].trim())} ${toTitleCase(locations[0].trim())}`.trim();
      }
    } else if (phrases.length === 1) {
      defaultName = toTitleCase(phrases[0].trim());
    } else {
      defaultName = `Outreach Pack - ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    setNewPackNameInput(defaultName);

    const firstPhrase = selectedProspects[0]?.searchPhrase || selectedProspects[0]?.searchKeyword || '';
    const firstLoc = selectedProspects[0]?.location || '';
    const isLocalPack = selectedProspects.some(p => p.searchType === 'GMB' || p.searchType === 'local');

    const defaultGen = isLocalPack
      ? generateLocalPartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc })
      : generatePartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc });

    // Choose appropriate master template based on isLocalPack
    let selectedMaster = null;
    if (isLocalPack) {
      selectedMaster = masterTemplates.find(t => t.id === 'tpl_local_partnership_long' || t.name.includes('(Local)')) || masterTemplates[0];
    } else {
      selectedMaster = masterTemplates.find(t => t.id === 'tpl_warm_partnership' || t.name.includes('(Organic)')) || masterTemplates[0];
    }

    if (selectedMaster) {
      setNewPackTemplateId(selectedMaster.id);
      setNewPackSubjectInput(selectedMaster.subject);
      setNewPackBodyInput(stripLeadingGreeting(selectedMaster.body));
    } else {
      setNewPackTemplateId('');
      setNewPackSubjectInput(defaultGen.subject);
      setNewPackBodyInput(stripLeadingGreeting(defaultGen.body));
    }

    setIsCreatingPackModalOpen(true);
  };

  // Initial load: Fetch server exclusions & clear legacy localStorage keys so they never overwrite server master baseline
  useEffect(() => {
    const initExclusions = async () => {
      try {
        try {
          localStorage.removeItem('tse_excluded_domains');
          localStorage.removeItem('leadgen_excluded_domains');
        } catch (e) {}

        const res = await fetch(`${API_BASE}/api/exclusions`);
        if (res.ok) {
          const data = await res.json();
          setExcludedDomains(data);
        }
      } catch (err) {
        console.error('Failed to initialize server exclusions:', err);
      }
    };
    initExclusions();
    fetchSenderStatus();
  }, []);
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
      const response = await fetch(`${API_BASE}/api/milestones`);
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

  const fetchSavedSearches = async () => {
    try {
      // 1. Fetch current list from the backend database
      const response = await fetch(`${API_BASE}/api/saved-searches`);
      if (!response.ok) throw new Error('Failed to load saved searches');
      let dbSearches = await response.json();

      // 2. Check if one-time migration has been completed
      const migrationCompleted = localStorage.getItem('tse_saved_searches_migrated') === 'true';
      if (!migrationCompleted) {
        // If the database is empty, perform the import from localStorage
        if (dbSearches.length === 0) {
          const localSaved = localStorage.getItem('tse_saved_searches');
          if (localSaved) {
            try {
              const searchesToMigrate = JSON.parse(localSaved);
              if (Array.isArray(searchesToMigrate) && searchesToMigrate.length > 0) {
                console.log(`Migrating ${searchesToMigrate.length} saved searches from localStorage to backend database...`);
                for (const search of searchesToMigrate) {
                  // Preserve all fields and legacy fields if missing
                  if (!search.searchId) {
                    search.searchId = `SR${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
                  }
                  if (!search.searchType) {
                    search.searchType = search.searchMode === 'organic' ? 'Organic' : 'GMB';
                  }
                  await fetch(`${API_BASE}/api/saved-searches`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(search)
                  });
                }
                
                // Refresh list from the database after successful migration
                const refreshedResponse = await fetch(`${API_BASE}/api/saved-searches`);
                if (refreshedResponse.ok) {
                  dbSearches = await refreshedResponse.json();
                }
              }
            } catch (migrationErr) {
              console.error("Migration error:", migrationErr);
            }
          }
        }
        // Mark migration as completed so it never runs again
        localStorage.setItem('tse_saved_searches_migrated', 'true');
      }

      setSavedSearches(dbSearches);
    } catch (e) {
      console.error("Error loading saved searches:", e);
    }
  };

  const fetchOutreachList = async () => {
    setIsOutreachLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/outreach`);
      if (res.ok) {
        const data = await res.json();
        setOutreachList(data);
      }
    } catch (err) {
      console.error("Error loading outreach list:", err);
    } finally {
      setIsOutreachLoading(false);
    }
  };

  const isShortlisted = (urlOrDomain) => {
    if (!urlOrDomain) return false;
    const target = normalizeDomain(urlOrDomain);
    if (!target) return false;
    return outreachList.some(item => {
      const itemDom = normalizeDomain(item.domain || item.url || '');
      return itemDom === target;
    });
  };

  const handleAddToOutreach = async (item) => {
    const isOrganic = !item.name;
    const domain = normalizeDomain(item.domain || item.url || item.website || '');
    const url = item.url || item.website || (domain ? `https://${domain}` : '');
    const businessName = item.name || item.analysis?.gbp?.businessName || item.analysis?.pageTitle || domain;
    const searchId = activeSearchId || item.searchId || 'Not available';
    const rawTrade = businessType || item.searchKeyword || item.businessType || item.trade || '';
    const loc = location || item.location || 'Anywhere';
    const searchPhrase = getSearchPhrase(rawTrade, loc);
    const searchType = searchMode === 'organic' || item.searchType === 'Organic' ? 'Organic' : 'GMB';
    const rank = item.rank || item.analysis?.rank || 0;
    const phone = item.phone || item.analysis?.phone || null;
    const address = item.address || item.analysis?.address || null;
    const rating = item.rating ?? item.analysis?.rating ?? null;
    const reviewsCount = item.reviewsCount ?? item.analysis?.reviewsCount ?? null;
    const contactEmail = item.contactEmail || item.analysis?.contactEmail || null;
    const allFoundEmails = item.allFoundEmails || item.analysis?.allFoundEmails || (contactEmail ? [contactEmail] : []);
    const emailStatus = contactEmail ? 'Email Found' : (item.emailStatus || 'No Email');
    const oppScore = item.analysis?.leadOpportunityScore?.score !== undefined ? item.analysis.leadOpportunityScore.score : null;
    const oppBand = item.analysis?.leadOpportunityScore?.band || '';
    const strengthStars = item.analysis?.leadPriority?.stars || '★★★☆☆';
    const strengthLabel = item.analysis?.leadPriority?.label || 'Good Lead';
    const strengthPoints = item.analysis?.leadPriority?.points || 0;
    const gbpStatus = item.analysis?.gbp?.status === 'Found' ? 'Found' : (item.analysis?.gbp?.status === 'Multiple Matches' ? 'Multiple Matches' : 'No Profile Matched');

    try {
      const res = await fetch(`${API_BASE}/api/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          url,
          businessName,
          searchId,
          searchPhrase,
          trade: rawTrade,
          businessType: rawTrade,
          searchKeyword: rawTrade,
          location: loc,
          searchType,
          rank,
          phone,
          address,
          rating,
          reviewsCount,
          contactEmail,
          allFoundEmails,
          emailStatus,
          opportunityScore: oppScore,
          opportunityBand: oppBand,
          commercialStrengthStars: strengthStars,
          commercialStrengthLabel: strengthLabel,
          commercialStrengthPoints: strengthPoints,
          gbpStatus,
          analysisData: item.analysis || item
        })
      });
      if (res.ok) {
        await fetchOutreachList();
      }
    } catch (e) {
      console.error("Error adding to outreach list:", e);
    }
  };

  const handleRemoveFromOutreach = async (idOrDomain) => {
    if (!idOrDomain) return;
    try {
      const res = await fetch(`${API_BASE}/api/outreach/${encodeURIComponent(idOrDomain)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchOutreachList();
      }
    } catch (e) {
      console.error("Error removing from outreach list:", e);
    }
  };

  const fetchOutreachPacks = async () => {
    setIsPacksLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs`);
      if (res.ok) {
        const data = await res.json();
        setOutreachPacks(data);
      }
    } catch (e) {
      console.error("Error fetching outreach packs:", e);
    } finally {
      setIsPacksLoading(false);
    }
  };

  const fetchContactHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/outreach/history`);
      if (res.ok) {
        const data = await res.json();
        setContactHistory(data);
      }
    } catch (e) {
      console.error("Error fetching contact history:", e);
    }
  };

  const getContactHistoryWarning = (domain, currentPackId = null) => {
    if (!domain || !contactHistory.length) return null;
    const norm = normalizeDomain(domain);
    const matches = contactHistory.filter(h => normalizeDomain(h.domain) === norm && (!currentPackId || h.packId !== currentPackId));
    if (matches.length > 0) {
      const latest = matches[0];
      return {
        packId: latest.packId,
        status: latest.status,
        sentAt: latest.sentAt
      };
    }
    return null;
  };

  const getProspectAssignedPack = (item) => {
    if (!item) return null;
    const itemDomain = normalizeDomain(item.domain || item.url || '');
    const itemId = item.id;

    // 1. Primary check across all loaded outreachPacks
    for (const pack of outreachPacks) {
      if (!pack.packId || pack.packId.startsWith('TEMP_') || pack.packId.startsWith('OP')) continue;
      if (pack.prospects && Array.isArray(pack.prospects)) {
        const found = pack.prospects.some(p => {
          const pDomain = normalizeDomain(p.domain || p.url || '');
          return (pDomain && pDomain === itemDomain) || (itemId && p.id === itemId);
        });
        if (found) {
          return pack;
        }
      }
    }

    // 2. Fallback check in contactHistory: only for valid GM/OR pack IDs
    if (contactHistory && contactHistory.length) {
      const hist = contactHistory.find(h => normalizeDomain(h.domain) === itemDomain);
      if (hist && hist.packId && (hist.packId.startsWith('GM') || hist.packId.startsWith('OR'))) {
        const matchedPack = outreachPacks.find(p => p.packId === hist.packId);
        return matchedPack || { packId: hist.packId, status: hist.status, searchType: hist.packId.startsWith('GM') ? 'GMB' : 'Organic' };
      }
    }

    return null;
  };

  const handleCreatePackSubmit = async (customName, customSubject, customBody) => {
    const selectedProspects = outreachList.filter(item => selectedShortlistIds.has(item.id || item.domain));
    if (selectedProspects.length === 0) return;

    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName || undefined,
          templateSubject: customSubject || undefined,
          templateBody: customBody || undefined,
          prospects: selectedProspects
        })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchOutreachPacks();
        await fetchContactHistory();
        setSelectedShortlistIds(new Set());
        setIsCreatingPackModalOpen(false);
        setNewPackNameInput('');
        if (data.pack) {
          setActivePack(data.pack);
          setOutreachSubView('pack-detail');
          // Automatically trigger contact finding in background for prospects without email
          handleFindContactsForPack(data.pack.packId, data.pack.prospects);
        }
      }
    } catch (e) {
      console.error("Error creating outreach pack:", e);
    }
  };

  const handleOpenPack = async (pack) => {
    setActivePack(pack);
    setOutreachSubView('pack-detail');
    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs/${encodeURIComponent(pack.packId || pack.id)}`);
      if (res.ok) {
        const fullPack = await res.json();
        setActivePack(fullPack);
        const matching = masterTemplates.find(t => t.subject === fullPack.templateSubject);
        if (matching) {
          setSelectedMasterTemplateIdForPack(matching.id);
        } else {
          setSelectedMasterTemplateIdForPack('');
        }
      }
    } catch (err) {
      console.error("Error loading full pack details:", err);
    }
  };

  const handleUpdatePack = async (packId, updates) => {
    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs/${encodeURIComponent(packId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        setActivePack(data.pack);
        setOutreachPacks(prev => prev.map(p => p.packId === packId ? data.pack : p));
        await fetchContactHistory();
      }
    } catch (e) {
      console.error("Error updating pack:", e);
    }
  };

  const handleDeletePack = async (packId) => {
    if (!confirm(`Are you sure you want to delete Outreach Pack ${packId}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs/${encodeURIComponent(packId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchOutreachPacks();
        await fetchOutreachList();
        await fetchContactHistory();
        if (activePack?.packId === packId) {
          setActivePack(null);
          setOutreachSubView('packs');
        }
      }
    } catch (e) {
      console.error("Error deleting pack:", e);
    }
  };

  const handleSendPack = async () => {
    if (!activePack) return;
    setIsSendingPack(true);
    setSendErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/outreach-packs/${encodeURIComponent(activePack.packId)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedProspectIds: Array.from(selectedProspectIdsInPack)
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSendErrorMsg(data.error || 'Failed to send outreach pack');
      } else {
        setActivePack(data.pack);
        setOutreachPacks(prev => prev.map(p => p.packId === activePack.packId ? data.pack : p));
        await fetchContactHistory();
        setIsSendConfirmModalOpen(false);
      }
    } catch (err) {
      console.error("Error sending outreach pack:", err);
      setSendErrorMsg(err.message || 'Network error while sending');
    } finally {
      setIsSendingPack(false);
    }
  };

  const handleSaveProspectEmail = async (packId, prospectKey, newEmail) => {
    const currentPack = activePack && activePack.packId === packId ? activePack : outreachPacks.find(p => p.packId === packId);
    if (!currentPack) return;
    const cleanEmail = (newEmail || '').trim();
    const hasEmail = Boolean(cleanEmail);
    const updatedProspects = (currentPack.prospects || []).map(p => {
      const pKey = p.id || p.domain;
      if (pKey === prospectKey) {
        return {
          ...p,
          contactEmail: cleanEmail || null,
          allFoundEmails: cleanEmail ? (p.allFoundEmails?.includes(cleanEmail) ? p.allFoundEmails : [cleanEmail, ...(p.allFoundEmails || [])]) : (p.allFoundEmails || []),
          manualEmail: hasEmail,
          emailStatus: hasEmail ? 'Email Found' : 'No Email',
          sendStatus: p.sendStatus === 'Sent' ? 'Sent' : (hasEmail ? 'Email Found' : 'No Email')
        };
      }
      return p;
    });

    setActivePack(prev => prev && prev.packId === packId ? { ...prev, prospects: updatedProspects } : prev);
    await handleUpdatePack(packId, { prospects: updatedProspects });
    setEditingProspectId(null);
  };

  const handleFindContactsForPack = async (packId, prospectsToSearch) => {
    if (!packId || !prospectsToSearch || prospectsToSearch.length === 0) return;
    setIsFindingContacts(true);
    setSearchingProspectIds(prev => new Set([...prev, ...prospectsToSearch.map(p => p.id || p.domain)]));

    const currentPack = activePack && activePack.packId === packId ? activePack : outreachPacks.find(p => p.packId === packId);
    if (!currentPack) {
      setIsFindingContacts(false);
      setSearchingProspectIds(new Set());
      return;
    }

    let updatedProspects = [...currentPack.prospects];

    for (const prospect of prospectsToSearch) {
      const prospectKey = prospect.id || prospect.domain;
      try {
        const targetUrl = prospect.url || (prospect.domain ? `https://${prospect.domain}` : '');
        const res = await fetch(`${API_BASE}/api/outreach-packs/find-contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, domain: prospect.domain })
        });
        if (res.ok) {
          const contactInfo = await res.json();
          updatedProspects = updatedProspects.map(p => {
            if (p.id === prospect.id || p.domain === prospect.domain) {
              const isManual = Boolean(p.manualEmail && p.contactEmail);
              const finalEmail = isManual ? p.contactEmail : (contactInfo.contactEmail || null);
              const newStatus = finalEmail ? 'Email Found' : 'No Email';
              return {
                ...p,
                contactEmail: finalEmail,
                manualEmail: isManual,
                emailStatus: isManual ? 'Email Found' : (contactInfo.status || 'No Email'),
                allFoundEmails: contactInfo.allFoundEmails || (finalEmail ? [finalEmail] : []),
                emailSource: isManual ? p.emailSource : (contactInfo.emailSource || null),
                sendStatus: p.sendStatus === 'Sent' ? 'Sent' : newStatus
              };
            }
            return p;
          });
          setActivePack(prev => prev && prev.packId === packId ? { ...prev, prospects: updatedProspects } : prev);
        } else {
          updatedProspects = updatedProspects.map(p => {
            if (p.id === prospect.id || p.domain === prospect.domain) {
              if (p.manualEmail && p.contactEmail) return p;
              return {
                ...p,
                emailStatus: 'Search Failed'
              };
            }
            return p;
          });
          setActivePack(prev => prev && prev.packId === packId ? { ...prev, prospects: updatedProspects } : prev);
        }
      } catch (err) {
        console.error("Error finding contact for", prospect.domain, err);
        updatedProspects = updatedProspects.map(p => {
          if (p.id === prospect.id || p.domain === prospect.domain) {
            if (p.manualEmail && p.contactEmail) return p;
            return {
              ...p,
              emailStatus: 'Search Failed'
            };
          }
          return p;
        });
        setActivePack(prev => prev && prev.packId === packId ? { ...prev, prospects: updatedProspects } : prev);
      } finally {
        setSearchingProspectIds(prev => {
          const next = new Set(prev);
          next.delete(prospectKey);
          return next;
        });
      }
    }

    // Persist all updates to SQLite
    await handleUpdatePack(packId, { prospects: updatedProspects });
    setIsFindingContacts(false);
  };

  const handleGenerateEmailsForPack = async (packId, prospectsToGenerate) => {
    if (!packId || !prospectsToGenerate || prospectsToGenerate.length === 0) return;

    const currentPack = activePack && activePack.packId === packId ? activePack : outreachPacks.find(p => p.packId === packId);
    if (!currentPack) return;

    let updatedProspects = [...currentPack.prospects];

    for (const prospect of prospectsToGenerate) {
      try {
        const res = await fetch(`${API_BASE}/api/outreach-packs/generate-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: prospect.businessName,
            domain: prospect.domain,
            searchKeyword: prospect.searchPhrase || prospect.searchKeyword,
            location: prospect.location
          })
        });
        if (res.ok) {
          const emailData = await res.json();
          updatedProspects = updatedProspects.map(p => {
            if (p.id === prospect.id || p.domain === prospect.domain) {
              return {
                ...p,
                emailSubject: emailData.subject,
                emailBody: emailData.body,
                sendStatus: p.sendStatus === 'Shortlisted' || p.sendStatus === 'Email Found' ? 'Draft Ready' : p.sendStatus
              };
            }
            return p;
          });
          setActivePack(prev => prev && prev.packId === packId ? { ...prev, prospects: updatedProspects } : prev);
        }
      } catch (err) {
        console.error("Error generating email draft for", prospect.domain, err);
      }
    }

    await handleUpdatePack(packId, { prospects: updatedProspects });
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchMilestones();
    fetchSavedSearches();
    fetchOutreachList();
    fetchOutreachPacks();
    fetchContactHistory();
    fetchEmailTemplates();
    fetchSenderSettings();

    const params = new URLSearchParams(window.location.search);
    const searchIdParam = params.get('searchId');
    const viewParam = params.get('view');
    const itemParam = params.get('item');
    const packParam = params.get('pack');

    if (viewParam && !searchIdParam) {
      if (['saved', 'exclusions', 'settings', 'outreach', 'shortlist', 'packs', 'templates'].includes(viewParam)) {
        if (viewParam === 'packs') {
          setCurrentView('outreach');
          setOutreachSubView('packs');
        } else if (viewParam === 'shortlist') {
          setCurrentView('outreach');
          setOutreachSubView('shortlist');
        } else if (viewParam === 'templates') {
          setCurrentView('outreach');
          setOutreachSubView('templates');
          const contextParam = params.get('context');
          if (contextParam === 'local') setTemplateTab('local');
          else if (contextParam === 'organic') setTemplateTab('organic');
          else setTemplateTab('master');
        } else {
          setCurrentView(viewParam);
        }

        const tabParam = params.get('tab');
        const contextParam = params.get('context');
        if (tabParam === 'packs') {
          setOutreachSubView('packs');
        } else if (tabParam === 'shortlist') {
          setOutreachSubView('shortlist');
        } else if (tabParam === 'templates') {
          setOutreachSubView('templates');
          if (contextParam === 'local') setTemplateTab('local');
          else if (contextParam === 'organic') setTemplateTab('organic');
          else setTemplateTab('master');
        }

        if ((viewParam === 'outreach' || viewParam === 'packs') && packParam) {
          fetch(`${API_BASE}/api/outreach-packs/${encodeURIComponent(packParam)}`)
            .then(r => r.ok ? r.json() : null)
            .then(p => {
              if (p) {
                setActivePack(p);
                setOutreachSubView('pack-detail');
              }
            }).catch(() => {});
        }
      }
    }

    if (searchIdParam) {
      const loadFromUrl = async () => {
        try {
          let currentExclusions = [];
          try {
            const excRes = await fetch(`${API_BASE}/api/exclusions`);
            if (excRes.ok) {
              currentExclusions = await excRes.json();
              setExcludedDomains(currentExclusions);
            }
          } catch (err) {}

          const res = await fetch(`${API_BASE}/api/saved-searches/${encodeURIComponent(searchIdParam)}`);
          if (res.ok) {
            const saved = await res.json();
            setBusinessType(saved.businessType === 'Any' ? '' : saved.businessType);
            setLocation(saved.location === 'Anywhere' ? '' : saved.location);
            setSearchMode(saved.searchMode || (saved.searchType === 'Organic' ? 'organic' : 'local'));
            setActiveSearchId(saved.searchId || null);

            const filtered = (saved.data || [])
              .filter(item => !isDomainExcluded(item.domain || item.website || item.url, currentExclusions))
              .map((item, idx) => {
                if (item.rank === undefined || item.rank === null) {
                  return { ...item, rank: idx + 1 };
                }
                return item;
              });

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

            // If any items are unscored, automatically resume bulk scoring in the background
            const unscored = enriched.filter(i => !i.analysis || i.analysis.leadOpportunityScore === undefined);
            if (unscored.length > 0) {
              runBulkAnalysis(unscored, saved.searchId, saved.location || 'Anywhere');
            }

            if (viewParam === 'analyse' && itemParam) {
              const matchedItem = enriched.find(item => 
                (item.url && item.url === itemParam) || 
                (item.domain && item.domain === itemParam) || 
                (item.website && item.website === itemParam) ||
                (item.name && item.name === itemParam)
              );
              if (matchedItem && matchedItem.analysis) {
                const isOrganic = !matchedItem.name;
                const analysisObj = {
                  ...matchedItem.analysis,
                  domain: matchedItem.domain || getDomain(matchedItem.website || matchedItem.url),
                  url: matchedItem.url || matchedItem.website || '',
                  searchId: saved.searchId || 'Not available',
                  searchType: isOrganic ? 'Organic' : 'GMB',
                  searchKeyword: saved.businessType || 'Any',
                  location: saved.location || 'Anywhere',
                  rank: matchedItem.rank || matchedItem.analysis?.rank || 0
                };
                setActiveAnalysisItem(analysisObj);
                addToRecentAnalyses(analysisObj);
                setCurrentView('analyse');
              } else {
                setCurrentView('search');
              }
            } else {
              setCurrentView('search');
            }
          }
        } catch (e) {
          console.error("Failed to restore search from URL:", e);
        }
      };
      loadFromUrl();
    }
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
      const response = await fetch(`${API_BASE}/api/milestones/create`, {
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
  
  const [savedSearches, setSavedSearches] = useState([]);

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ businessType, location, searchMode })
      });
      const data = await response.json();
      console.log(data);
      if (response.ok) {
        let currentExclusions = excludedDomains;
        try {
          const excRes = await fetch(`${API_BASE}/api/exclusions`);
          if (excRes.ok) {
            currentExclusions = await excRes.json();
            setExcludedDomains(currentExclusions);
          }
        } catch (err) {}

        // Filter out excluded domains (using server-backed exclusions)
        const filteredData = data.filter(item => !isDomainExcluded(item.domain || item.website || item.url, currentExclusions));

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
        
        let targetSearchId = activeSearchId;

        // Save search automatically or update if refreshing
        if (activeSearchId) {
          setSavedSearches(prev => {
            const updated = prev.map(saved => {
              if (saved.searchId === activeSearchId) {
                const updatedSearch = {
                  ...saved,
                  count: enrichedData.length,
                  data: enrichedData,
                  dateTime: new Date().toLocaleString()
                };

                // Save/Overwrite the updated search in the backend database
                fetch(`${API_BASE}/api/saved-searches`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatedSearch)
                }).catch(err => console.error("Error updating search during refresh:", err));

                return updatedSearch;
              }
              return saved;
            });
            return updated;
          });
        } else {
          let maxIdNum = 0;
          savedSearches.forEach(s => {
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
          
          targetSearchId = nextIdStr;
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

          // Save to backend database as a new entry
          fetch(`${API_BASE}/api/saved-searches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSearch)
          }).catch(err => console.error("Error saving search:", err));

          setSavedSearches(prev => [newSearch, ...prev]);
        }

        try {
          const u = new URL(window.location.href);
          u.search = `?searchId=${encodeURIComponent(targetSearchId)}`;
          window.history.replaceState(null, '', u.toString());
        } catch (e) {}

        // Automatically start bulk scoring and background email discovery of discovered prospects
        runBulkAnalysis(enrichedData, targetSearchId, location.trim() || 'Anywhere');
        runBulkEmailDiscovery(enrichedData, targetSearchId);
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
    try {
      const u = new URL(window.location.href);
      u.search = '';
      window.history.replaceState(null, '', u.toString());
    } catch (e) {}
  };

  const handleLoadSavedSearch = async (saved) => {
    setBusinessType(saved.businessType === 'Any' ? '' : saved.businessType);
    setLocation(saved.location === 'Anywhere' ? '' : saved.location);
    setSearchMode(saved.searchMode || 'local');
    setActiveSearchId(saved.searchId || null);
    
    let currentExclusions = excludedDomains;
    try {
      const excRes = await fetch(`${API_BASE}/api/exclusions`);
      if (excRes.ok) {
        currentExclusions = await excRes.json();
        setExcludedDomains(currentExclusions);
      }
    } catch (err) {}

    // Filter stored results against current exclusions dynamically (using server-backed exclusions)
    const filtered = (saved.data || [])
      .filter(item => !isDomainExcluded(item.domain || item.website || item.url, currentExclusions))
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

    // If any items are unscored, automatically resume bulk scoring in the background
    const unscored = enriched.filter(i => !i.analysis || i.analysis.leadOpportunityScore === undefined);
    if (unscored.length > 0) {
      runBulkAnalysis(unscored, saved.searchId, saved.location || 'Anywhere');
    }

    // Automatically check emails for any unscanned items
    const unCheckedEmails = enriched.filter(i => !i.contactEmail && (!i.emailStatus || i.emailStatus === 'checking'));
    if (unCheckedEmails.length > 0) {
      runBulkEmailDiscovery(unCheckedEmails, saved.searchId);
    }

    try {
      const u = new URL(window.location.href);
      u.search = `?searchId=${encodeURIComponent(saved.searchId)}`;
      window.history.replaceState(null, '', u.toString());
    } catch (e) {}
  };

  const handleBackToResults = async () => {
    setCurrentView('search');
    try {
      const u = new URL(window.location.href);
      if (activeSearchId && activeSearchId !== 'Not available') {
        u.search = `?searchId=${encodeURIComponent(activeSearchId)}`;
      } else {
        u.search = '';
      }
      window.history.replaceState(null, '', u.toString());
    } catch (e) {}

    // If searchResults is empty in state but activeSearchId exists, restore saved search
    if ((!searchResults || searchResults.length === 0) && activeSearchId && activeSearchId !== 'Not available') {
      const existingSaved = savedSearches.find(s => s.searchId === activeSearchId);
      if (existingSaved) {
        handleLoadSavedSearch(existingSaved);
      } else {
        try {
          const res = await fetch(`${API_BASE}/api/saved-searches/${encodeURIComponent(activeSearchId)}`);
          if (res.ok) {
            const savedData = await res.json();
            handleLoadSavedSearch(savedData);
          }
        } catch (err) {}
      }
    }
  };

  const handleDeleteSavedSearch = (id) => {
    // Delete from backend database
    fetch(`${API_BASE}/api/saved-searches/${id}`, {
      method: 'DELETE'
    }).catch(err => console.error("Error deleting search:", err));

    setSavedSearches(prev => prev.filter(s => s.id !== id));
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

    try {
      const u = new URL(window.location.href);
      if (recent.analysis.searchId) u.searchParams.set('searchId', recent.analysis.searchId);
      u.searchParams.set('view', 'analyse');
      u.searchParams.set('item', recent.analysis.url || recent.analysis.domain || '');
      window.history.replaceState(null, '', u.toString());
    } catch (e) {}
  };

  const updateItemAnalysis = (urlOrName, analysisData, targetSearchId, rank) => {
    const currentSearchId = targetSearchId || activeSearchId;

    // 1. Update searchResults state
    setSearchResults(prev => prev.map(item => {
      const isOrganic = !item.name;
      const key = isOrganic ? item.url : (item.website || item.name);
      const isRankMatch = rank !== undefined && rank !== null && item.rank === rank;
      if (key === urlOrName || isRankMatch) {
        return { ...item, analysis: analysisData };
      }
      return item;
    }));

    // 2. Update savedSearches state in memory
    setSavedSearches(prev => {
      return prev.map(saved => {
        if (saved.searchId === currentSearchId) {
          const updatedData = saved.data.map(item => {
            const isOrganic = !item.name;
            const key = isOrganic ? item.url : (item.website || item.name);
            const isRankMatch = rank !== undefined && rank !== null && item.rank === rank;
            if (key === urlOrName || isRankMatch) {
              return { ...item, analysis: analysisData };
            }
            return item;
          });
          return { ...saved, data: updatedData };
        }
        return saved;
      });
    });

    // 3. Atomically update backend database for this single item
    if (currentSearchId) {
      fetch(`${API_BASE}/api/saved-searches/${encodeURIComponent(currentSearchId)}/item-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlOrName && urlOrName.startsWith('http') ? urlOrName : undefined,
          website: urlOrName,
          name: urlOrName,
          rank: rank,
          analysis: analysisData
        })
      }).catch(err => console.error("Error updating item analysis in database:", err));
    }
  };

  const analyseItem = async (item, targetSearchId, searchLocation) => {
    const isOrganic = !item.name;
    const url = isOrganic ? item.url : (item.website || '');
    const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
    const itemKey = isOrganic ? item.url : (item.website || item.name);
    const searchLoc = searchLocation || location || 'Anywhere';

    if (item.analysis) {
      return item.analysis;
    }

    try {
      const response = await fetch(`${API_BASE}/api/analyse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          url: url || domain,
          searchType: isOrganic ? 'Organic' : 'GMB',
          rank: item.rank || 0,
          location: searchLoc
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
        leadPriority: data.leadPriority || null,
        contactEmail: data.contactEmail || null,
        allFoundEmails: data.allFoundEmails || [],
        emailStatus: data.emailStatus || (data.contactEmail ? 'Email Found' : 'No Email'),
        emailSource: data.emailSource || null
      };

      updateItemAnalysis(itemKey, completedAnalysis, targetSearchId, item.rank);
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
          titlePresent: 'N/A',
          descriptionPresent: 'N/A',
          h1Present: 'N/A',
          pageType: 'Homepage',
          overallOpportunity: 'N/A',
          reasonToContact: 'Connection error while attempting to analyze site.',
          suggestedEmailAngle: 'Reach out to check if their website server is experiencing downtime.'
        },
        gbp: null,
        diagnosticFailureReason: e?.message || 'Connection error while communicating with analysis server',
        leadOpportunityScore: {
          score: 55,
          band: 'Moderate',
          reasons: [
            "Website connection timed out or blocked by server",
            "Technical signals estimated from search ranking position",
            "Direct technical review recommended"
          ]
        },
        leadPriority: {
          stars: '★★★☆☆',
          label: 'Moderate Opportunity',
          explanation: "Website connection timed out or was inaccessible. High opportunity for technical hosting or server optimization.",
          points: 50
        }
      };
      updateItemAnalysis(itemKey, failedAnalysis, targetSearchId, item.rank);
      return failedAnalysis;
    }
  };

  const runBulkAnalysis = async (itemsToAnalyse, targetSearchId, searchLocation) => {
    if (!itemsToAnalyse || itemsToAnalyse.length === 0) return;
    
    setIsBulkAnalysing(true);
    const total = itemsToAnalyse.length;
    let completedCount = 0;
    setBulkProgress({ current: 0, total });

    const CONCURRENCY = 3;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < itemsToAnalyse.length) {
        const currentIndex = nextIndex++;
        const item = itemsToAnalyse[currentIndex];
        try {
          await analyseItem(item, targetSearchId, searchLocation);
        } catch (e) {
          console.error("Analysis worker error:", e);
        } finally {
          completedCount++;
          setBulkProgress({ current: Math.min(completedCount, total), total });
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, itemsToAnalyse.length) }, () => worker());
    await Promise.all(workers);

    // Final full sync of current searchResults to backend to guarantee 100% database consistency
    if (targetSearchId) {
      setSavedSearches(prev => {
        const currentSaved = prev.find(s => s.searchId === targetSearchId);
        if (currentSaved) {
          fetch(`${API_BASE}/api/saved-searches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSaved)
          }).catch(err => console.error("Error in final search sync:", err));
        }
        return prev;
      });
    }

    setIsBulkAnalysing(false);
  };

  const updateItemEmail = (urlOrName, contactInfo, targetSearchId, rank) => {
    const currentSearchId = targetSearchId || activeSearchId;
    const status = contactInfo?.status === 'Email Found' || contactInfo?.contactEmail ? 'Email Found' : 'No Email';
    const contactEmail = contactInfo?.contactEmail || null;
    const allFoundEmails = contactInfo?.allFoundEmails || (contactEmail ? [contactEmail] : []);
    const emailSource = contactInfo?.emailSource || null;

    // 1. Update searchResults state
    setSearchResults(prev => prev.map(item => {
      const isOrganic = !item.name;
      const key = isOrganic ? item.url : (item.website || item.name);
      const isRankMatch = rank !== undefined && rank !== null && item.rank === rank;
      if (key === urlOrName || isRankMatch) {
        const updated = {
          ...item,
          contactEmail,
          allFoundEmails,
          emailStatus: status,
          emailSource
        };
        if (updated.analysis) {
          updated.analysis = {
            ...updated.analysis,
            contactEmail,
            allFoundEmails,
            emailStatus: status,
            emailSource
          };
        }
        return updated;
      }
      return item;
    }));

    // 2. Update savedSearches state in memory
    setSavedSearches(prev => prev.map(saved => {
      if (saved.searchId === currentSearchId) {
        const updatedData = (saved.data || []).map(item => {
          const isOrganic = !item.name;
          const key = isOrganic ? item.url : (item.website || item.name);
          const isRankMatch = rank !== undefined && rank !== null && item.rank === rank;
          if (key === urlOrName || isRankMatch) {
            const updated = {
              ...item,
              contactEmail,
              allFoundEmails,
              emailStatus: status,
              emailSource
            };
            if (updated.analysis) {
              updated.analysis = {
                ...updated.analysis,
                contactEmail,
                allFoundEmails,
                emailStatus: status,
                emailSource
              };
            }
            return updated;
          }
          return item;
        });
        return { ...saved, data: updatedData };
      }
      return saved;
    }));

    // 3. Atomically update backend database for this item's email
    if (currentSearchId) {
      fetch(`${API_BASE}/api/saved-searches/${encodeURIComponent(currentSearchId)}/item-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlOrName && urlOrName.startsWith('http') ? urlOrName : undefined,
          website: urlOrName,
          name: urlOrName,
          rank: rank,
          contactEmail,
          allFoundEmails,
          emailStatus: status,
          emailSource
        })
      }).catch(err => console.error("Error updating item email in database:", err));
    }
  };

  const runBulkEmailDiscovery = async (itemsToCheck, targetSearchId) => {
    if (!itemsToCheck || itemsToCheck.length === 0) return;
    const currentSearchId = targetSearchId || activeSearchId;

    const pendingItems = itemsToCheck.filter(i => {
      const hasEmail = Boolean(i.contactEmail || (i.analysis && i.analysis.contactEmail));
      const isCompleted = i.emailStatus === 'Email Found' || i.emailStatus === 'No Email' || i.emailStatus === 'No Email Found' ||
                          (i.analysis && (i.analysis.emailStatus === 'Email Found' || i.analysis.emailStatus === 'No Email' || i.analysis.emailStatus === 'No Email Found'));
      return !hasEmail && !isCompleted;
    });

    if (pendingItems.length === 0) return;

    const CONCURRENCY = 5;
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < pendingItems.length) {
        const idx = nextIdx++;
        const item = pendingItems[idx];
        const isOrganic = !item.name;
        const target = isOrganic ? item.url : (item.website || '');
        const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
        const itemKey = isOrganic ? item.url : (item.website || item.name);

        if (!target && !domain) {
          updateItemEmail(itemKey, { status: 'No Email', contactEmail: null, allFoundEmails: [] }, currentSearchId, item.rank);
          continue;
        }

        try {
          const res = await fetch(`${API_BASE}/api/outreach-packs/find-contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: target, domain: domain })
          });
          if (res.ok) {
            const contactInfo = await res.json();
            updateItemEmail(itemKey, contactInfo, currentSearchId, item.rank);
          } else {
            updateItemEmail(itemKey, { status: 'No Email', contactEmail: null, allFoundEmails: [] }, currentSearchId, item.rank);
          }
        } catch (err) {
          updateItemEmail(itemKey, { status: 'No Email', contactEmail: null, allFoundEmails: [] }, currentSearchId, item.rank);
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pendingItems.length) }, () => worker());
    await Promise.all(workers);

    // Final sync to backend saved_searches if search is active
    if (currentSearchId) {
      setSavedSearches(prev => {
        const currentSaved = prev.find(s => s.searchId === currentSearchId);
        if (currentSaved) {
          fetch(`${API_BASE}/api/saved-searches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSaved)
          }).catch(err => console.error("Error in final email sync:", err));
        }
        return prev;
      });
    }
  };

  const handleAnalyseAll = () => {
    if (isBulkAnalysing || searchResults.length === 0) return;
    runBulkAnalysis(searchResults, activeSearchId, location.trim() || 'Anywhere');
  };

  const handleAnalyse = async (item) => {
    const isOrganic = !item.name;
    const url = isOrganic ? item.url : (item.website || '');
    const domain = isOrganic ? item.domain : (item.website ? getDomain(item.website) : '');
    const itemKey = isOrganic ? item.url : (item.website || item.name);

    if (item.analysis && item.analysis.leadOpportunityScore?.score !== null) {
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

      try {
        const u = new URL(window.location.href);
        if (activeSearchId) u.searchParams.set('searchId', activeSearchId);
        u.searchParams.set('view', 'analyse');
        u.searchParams.set('item', url || domain || '');
        window.history.replaceState(null, '', u.toString());
      } catch (e) {}
      return;
    }

    setIsAnalysing(true);
    setAnalysisError(null);
    setCurrentView('analyse');
    
    try {
      const u = new URL(window.location.href);
      if (activeSearchId) u.searchParams.set('searchId', activeSearchId);
      u.searchParams.set('view', 'analyse');
      u.searchParams.set('item', url || domain || '');
      window.history.replaceState(null, '', u.toString());
    } catch (e) {}

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
      const response = await fetch(`${API_BASE}/api/analyse`, {
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

  const handleExcludeDomain = async (urlOrDomain) => {
    if (!urlOrDomain) return;
    const domain = normalizeDomain(urlOrDomain);
    if (!domain) return;
    
    // Immediately remove from currently displayed results
    setSearchResults(prev => prev.filter(item => !isDomainExcluded(item.domain || item.website || item.url, [domain])));

    try {
      const response = await fetch(`${API_BASE}/api/exclusions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      });
      if (response.ok) {
        const updatedList = await response.json();
        setExcludedDomains(updatedList);
        setSearchResults(prev => prev.filter(item => !isDomainExcluded(item.domain || item.website || item.url, updatedList)));
      }
    } catch (e) {
      console.error('Error adding server exclusion:', e);
    }
  };

  const handleRemoveExclusion = async (domain) => {
    if (!domain) return;
    try {
      const response = await fetch(`${API_BASE}/api/exclusions/${encodeURIComponent(domain)}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        const updatedList = await response.json();
        setExcludedDomains(updatedList);
      }
    } catch (e) {
      console.error('Error removing server exclusion:', e);
    }
  };

  return (
    <>
      <div className="app-container">
      
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
          <h2 className="sidebar-title" style={{ marginBottom: '0.35rem' }}>Lead Gen</h2>
          <div style={{
            fontSize: '0.75rem',
            color: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '4px',
            padding: '0.2rem 0.5rem',
            marginBottom: '1rem',
            fontWeight: '600',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            width: 'fit-content'
          }}>
            <span style={{ fontSize: '0.65rem' }}>🏢</span>
            <span>{currentUser?.workspaceLabel || (currentUser?.workspace === 'smoking_chili' ? 'Smoking Chili Media' : 'The Search Equation')}</span>
          </div>
          <div className="sidebar-menu">
            <button 
              onClick={handleNewSearchNav} 
              className={`sidebar-item ${currentView === 'search' && !activeSearchId ? 'active' : ''}`}
            >
              Home
            </button>
            <button 
              onClick={() => {
                setCurrentView('saved');
                try {
                  const u = new URL(window.location.href);
                  u.search = '?view=saved';
                  window.history.replaceState(null, '', u.toString());
                } catch (e) {}
              }} 
              className={`sidebar-item ${currentView === 'saved' ? 'active' : ''}`}
            >
              Saved Searches ({savedSearches.length})
            </button>
            <button 
              onClick={() => {
                setCurrentView('exclusions');
                try {
                  const u = new URL(window.location.href);
                  u.search = '?view=exclusions';
                  window.history.replaceState(null, '', u.toString());
                } catch (e) {}
              }} 
              className={`sidebar-item ${currentView === 'exclusions' ? 'active' : ''}`}
            >
              Manage Exclusions ({excludedDomains.length})
            </button>
            {/* Outreach Section with Shortlist and Packs sub-items */}
            <div className="sidebar-group">
              <button 
                onClick={() => {
                  setCurrentView('outreach');
                  setOutreachSubView('shortlist');
                  setActivePack(null);
                  try {
                    const u = new URL(window.location.href);
                    u.search = '?view=outreach&tab=shortlist';
                    window.history.replaceState(null, '', u.toString());
                  } catch (e) {}
                }} 
                className={`sidebar-item ${currentView === 'outreach' ? 'active-parent' : ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}
              >
                <span>Outreach</span>
              </button>
              
              <div className="sidebar-sub-menu">
                <button 
                  onClick={() => {
                    setCurrentView('outreach');
                    setOutreachSubView('shortlist');
                    setActivePack(null);
                    try {
                      const u = new URL(window.location.href);
                      u.search = '?view=outreach&tab=shortlist';
                      window.history.replaceState(null, '', u.toString());
                    } catch (e) {}
                  }} 
                  className={`sidebar-item sidebar-sub-item ${currentView === 'outreach' && outreachSubView === 'shortlist' ? 'active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>Shortlist ({outreachList.length})</span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentView('outreach');
                    setOutreachSubView('packs');
                    setActivePack(null);
                    try {
                      const u = new URL(window.location.href);
                      u.search = '?view=outreach&tab=packs';
                      window.history.replaceState(null, '', u.toString());
                    } catch (e) {}
                  }} 
                  className={`sidebar-item sidebar-sub-item ${currentView === 'outreach' && (outreachSubView === 'packs' || outreachSubView === 'pack-detail') ? 'active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>Outreach Packs ({outreachPacks.length})</span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentView('outreach');
                    setOutreachSubView('templates');
                    setTemplateTab('master');
                    setActivePack(null);
                    try {
                      const u = new URL(window.location.href);
                      u.search = '?view=outreach&tab=templates';
                      window.history.replaceState(null, '', u.toString());
                    } catch (e) {}
                  }} 
                  className={`sidebar-item sidebar-sub-item ${currentView === 'outreach' && outreachSubView === 'templates' ? 'active' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>Email Templates ({masterTemplates.length})</span>
                </button>
              </div>
            </div>
            <button 
              onClick={() => {
                setCurrentView('settings');
                try {
                  const u = new URL(window.location.href);
                  u.search = '?view=settings';
                  window.history.replaceState(null, '', u.toString());
                } catch (e) {}
              }} 
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
        {/* Top Header Bar: Far-Right Version & Status Controls */}
        <div className="main-top-bar" style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: '1rem',
          width: '100%',
          maxWidth: '1440px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          <GlobalDeploymentIndicator />
        </div>
        {currentView === 'search' && (
          <>
            <div className="search-header-container">
              <h1 className="header-title">Lead Generation Finder</h1>
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
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
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
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
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
                  <span>Fetching live search results...</span>
                </div>
              )}

              {searchError && (
                <div style={{ color: '#ef4444', marginTop: '1.25rem', fontSize: '0.95rem', fontWeight: '500' }}>
                  Error: {searchError}
                </div>
              )}

              {!searchError && (searchResults.length > 0 || activeSearchId) && (
                <div className="results-header-row">
                  <div className="results-count-text">
                    {searchMode === 'organic' ? (
                      `${searchResults.length} organic results found.`
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
                          Re-analyse All Prospects
                        </button>
                      )}
                      <button 
                        onClick={handleSearch} 
                        className="search-btn" 
                        style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem' }}
                        disabled={isSearching}
                      >
                        {isSearching ? 'Refreshing...' : 'Re-run Google Search — Uses API Credits'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {Array.isArray(searchResults) && searchResults.length > 0 && (() => {
              const ITEMS_PER_PAGE = 10;
              const sortedResults = getSortedResults();
              const totalPages = Math.ceil(sortedResults.length / ITEMS_PER_PAGE);
              const paginatedResults = sortedResults.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
              const isOrganicResult = searchMode === 'organic';

              return (
                <>
                <div style={{ width: '100%', maxWidth: '1440px', margin: '0 auto 0.75rem auto', fontSize: '0.9rem', color: '#94a3b8', fontWeight: '500', boxSizing: 'border-box' }}>
                  Opportunity Score: The higher the score, the better the lead opportunity. ★ = score 60+.
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
                          <th onClick={() => handleSort('position')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                            Position {renderSortIndicator('position')}
                          </th>
                          <th style={{ width: '60px', textAlign: 'center' }}>EMAIL</th>
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
                          const isItemShortlisted = isShortlisted(item.domain || item.url);
                          return (
                            <tr key={index} style={isItemShortlisted ? { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderLeft: '4px solid #3b82f6' } : {}}>
                              <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>#{item.rank}</td>
                              <td style={{ textAlign: 'center', width: '60px' }}>
                                {item.contactEmail || (item.analysis && item.analysis.contactEmail) || item.emailStatus === 'Email Found' || (item.analysis && item.analysis.emailStatus === 'Email Found') ? (
                                  <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Verified email found">✓</span>
                                ) : item.emailStatus === 'No Email' || item.emailStatus === 'No Email Found' || (item.analysis && (item.analysis.emailStatus === 'No Email' || item.analysis.emailStatus === 'No Email Found')) ? (
                                  <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Email check completed, none found">✕</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '1.2rem', letterSpacing: '1px', lineHeight: '1' }} title="Email check still running...">…</span>
                                )}
                              </td>
                              <td>
                                {item.analysis ? (
                                  item.analysis.leadOpportunityScore?.score !== null && item.analysis.leadOpportunityScore?.score !== undefined ? (
                                    (() => {
                                      const s = item.analysis.leadOpportunityScore.score;
                                      const isHot = s >= 70;
                                      return (
                                        <span style={{ 
                                          display: 'inline-flex', 
                                          alignItems: 'center',
                                          padding: isHot ? '2px 8px' : '0',
                                          borderRadius: isHot ? '6px' : '0',
                                          backgroundColor: isHot ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                          border: isHot ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
                                          boxShadow: isHot ? '0 0 6px rgba(239, 68, 68, 0.2)' : 'none'
                                        }}>
                                          <span style={{ 
                                            color: s >= 70 ? '#ef4444' : (s >= 40 ? '#f59e0b' : '#10b981'),
                                            marginRight: '6px',
                                            fontSize: '1.1rem',
                                            lineHeight: '1'
                                          }}>●</span>
                                          {s >= 60 && (
                                            <span style={{ color: '#f59e0b', marginRight: '4px', fontSize: '1rem', fontWeight: 'bold' }}>★</span>
                                          )}
                                          <span style={{ fontWeight: 'bold', fontSize: '1rem', color: isHot ? '#fca5a5' : '#ffffff' }}>
                                            {s}
                                          </span>
                                          {isHot && (
                                            <span style={{ 
                                              marginLeft: '6px', 
                                              fontSize: '0.68rem', 
                                              fontWeight: '800', 
                                              letterSpacing: '0.04em',
                                              color: '#ffffff',
                                              backgroundColor: '#dc2626',
                                              padding: '1px 5px',
                                              borderRadius: '3px'
                                            }}>
                                              HOT
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })()
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                      N/A
                                    </span>
                                  )
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
                                  {item.analysis ? (item.analysis.leadOpportunityScore?.score === null ? 'Retry' : 'View') : 'Analyse'}
                                </button>
                                {isItemShortlisted ? (
                                  <button 
                                    onClick={() => handleRemoveFromOutreach(item.domain || item.url)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#059669', color: '#ffffff', marginRight: '8px' }}
                                    title="Click to remove from Outreach List"
                                  >
                                    ✓ Shortlisted
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => handleAddToOutreach(item)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#2563eb', color: '#ffffff', marginRight: '8px' }}
                                  >
                                    + Shortlist
                                  </button>
                                )}
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
                          const isItemShortlisted = isShortlisted(domain || item.website || item.name);
                          return (
                            <tr key={index} style={isItemShortlisted ? { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderLeft: '4px solid #3b82f6' } : {}}>
                              <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>#{item.rank}</td>
                              <td style={{ textAlign: 'center', width: '60px' }}>
                                {item.contactEmail || (item.analysis && item.analysis.contactEmail) || item.emailStatus === 'Email Found' || (item.analysis && item.analysis.emailStatus === 'Email Found') ? (
                                  <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Verified email found">✓</span>
                                ) : item.emailStatus === 'No Email' || item.emailStatus === 'No Email Found' || (item.analysis && (item.analysis.emailStatus === 'No Email' || item.analysis.emailStatus === 'No Email Found')) ? (
                                  <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1' }} title="Email check completed, none found">✕</span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '1.2rem', letterSpacing: '1px', lineHeight: '1' }} title="Email check still running...">…</span>
                                )}
                              </td>
                              <td>
                                {item.rating !== null && item.rating !== undefined ? `⭐ ${item.rating}` : "Not available"}
                              </td>
                              <td>
                                {item.analysis ? (
                                  item.analysis.leadOpportunityScore?.score !== null && item.analysis.leadOpportunityScore?.score !== undefined ? (
                                    (() => {
                                      const s = item.analysis.leadOpportunityScore.score;
                                      const isHot = s >= 70;
                                      return (
                                        <span style={{ 
                                          display: 'inline-flex', 
                                          alignItems: 'center',
                                          padding: isHot ? '2px 8px' : '0',
                                          borderRadius: isHot ? '6px' : '0',
                                          backgroundColor: isHot ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                          border: isHot ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
                                          boxShadow: isHot ? '0 0 6px rgba(239, 68, 68, 0.2)' : 'none'
                                        }}>
                                          <span style={{ 
                                            color: s >= 70 ? '#ef4444' : (s >= 40 ? '#f59e0b' : '#10b981'),
                                            marginRight: '6px',
                                            fontSize: '1.1rem',
                                            lineHeight: '1'
                                          }}>●</span>
                                          {s >= 60 && (
                                            <span style={{ color: '#f59e0b', marginRight: '4px', fontSize: '1rem', fontWeight: 'bold' }}>★</span>
                                          )}
                                          <span style={{ fontWeight: 'bold', fontSize: '1rem', color: isHot ? '#fca5a5' : '#ffffff' }}>
                                            {s}
                                          </span>
                                          {isHot && (
                                            <span style={{ 
                                              marginLeft: '6px', 
                                              fontSize: '0.68rem', 
                                              fontWeight: '800', 
                                              letterSpacing: '0.04em',
                                              color: '#ffffff',
                                              backgroundColor: '#dc2626',
                                              padding: '1px 5px',
                                              borderRadius: '3px'
                                            }}>
                                              HOT
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })()
                                  ) : (
                                    <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                      N/A
                                    </span>
                                  )
                                ) : (
                                  <span style={{ color: '#64748b' }}>-</span>
                                )}
                              </td>
                              <td><strong>{item.name || "Not available"}</strong></td>
                              <td>
                                {item.website ? (
                                  <div>
                                    <a href={item.website} target="_blank" rel="noopener noreferrer" className="table-link">{domain || item.website}</a>
                                  </div>
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
                                  {item.analysis ? (item.analysis.leadOpportunityScore?.score === null ? 'Retry' : 'View') : 'Analyse'}
                                </button>
                                {isItemShortlisted ? (
                                  <button 
                                    onClick={() => handleRemoveFromOutreach(domain || item.website || item.name)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#059669', color: '#ffffff', marginRight: '8px' }}
                                    title="Click to remove from Outreach List"
                                  >
                                    ✓ Shortlisted
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => handleAddToOutreach(item)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#2563eb', color: '#ffffff', marginRight: '8px' }}
                                  >
                                    + Shortlist
                                  </button>
                                )}
                                <button 
                                  onClick={() => handleExcludeDomain(item.domain || item.website || item.name)}
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
            <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, color: '#ffffff' }}>Saved Searches</h2>
              </div>
              {(searchResults.length > 0 || (activeSearchId && activeSearchId !== 'Not available')) && (
                <button
                  onClick={handleBackToResults}
                  className="table-btn"
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #3b82f6',
                    color: '#60a5fa',
                    fontWeight: 'bold',
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                  title="Return to the active search results without re-querying or consuming API credits"
                >
                  <span>&larr; Back to Search Results</span>
                  {activeSearchId && activeSearchId !== 'Not available' && (
                    <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>({activeSearchId})</span>
                  )}
                </button>
              )}
            </div>
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
            <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, color: '#ffffff' }}>Excluded Domains</h2>
                <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
                  These domains are filtered out of all GMB and Organic search results.
                </p>
              </div>
              {(searchResults.length > 0 || (activeSearchId && activeSearchId !== 'Not available')) && (
                <button
                  onClick={handleBackToResults}
                  className="table-btn"
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #3b82f6',
                    color: '#60a5fa',
                    fontWeight: 'bold',
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                  title="Return to the active search results without re-querying or consuming API credits"
                >
                  <span>&larr; Back to Search Results</span>
                  {activeSearchId && activeSearchId !== 'Not available' && (
                    <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>({activeSearchId})</span>
                  )}
                </button>
              )}
            </div>
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
        {currentView === 'outreach' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '3rem' }}>
            {/* Outreach Top Navigation Bar (Only on Shortlist and Packs lists) */}
            {outreachSubView !== 'pack-detail' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#1e293b', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid #334155' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      setOutreachSubView('shortlist');
                      setActivePack(null);
                      try {
                        const u = new URL(window.location.href);
                        u.search = '?view=outreach&tab=shortlist';
                        window.history.replaceState(null, '', u.toString());
                      } catch (e) {}
                    }}
                    className="table-btn"
                    style={{
                      backgroundColor: outreachSubView === 'shortlist' ? '#2563eb' : '#0f172a',
                      border: outreachSubView === 'shortlist' ? '1px solid #3b82f6' : '1px solid #334155',
                      color: '#ffffff',
                      fontWeight: outreachSubView === 'shortlist' ? 'bold' : 'normal',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    Shortlist ({outreachList.length})
                  </button>
                  <button
                    onClick={() => {
                      setOutreachSubView('packs');
                      setActivePack(null);
                      try {
                        const u = new URL(window.location.href);
                        u.search = '?view=outreach&tab=packs';
                        window.history.replaceState(null, '', u.toString());
                      } catch (e) {}
                    }}
                    className="table-btn"
                    style={{
                      backgroundColor: outreachSubView === 'packs' ? '#2563eb' : '#0f172a',
                      border: outreachSubView === 'packs' ? '1px solid #3b82f6' : '1px solid #334155',
                      color: '#ffffff',
                      fontWeight: outreachSubView === 'packs' ? 'bold' : 'normal',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    Outreach Packs ({outreachPacks.length})
                  </button>
                  <button
                    onClick={() => {
                      setOutreachSubView('templates');
                      setTemplateTab('master');
                      setActivePack(null);
                      try {
                        const u = new URL(window.location.href);
                        u.search = '?view=outreach&tab=templates';
                        window.history.replaceState(null, '', u.toString());
                      } catch (e) {}
                    }}
                    className="table-btn"
                    style={{
                      backgroundColor: outreachSubView === 'templates' ? '#2563eb' : '#0f172a',
                      border: outreachSubView === 'templates' ? '1px solid #3b82f6' : '1px solid #334155',
                      color: '#ffffff',
                      fontWeight: outreachSubView === 'templates' ? 'bold' : 'normal',
                      padding: '0.5rem 1rem',
                      fontSize: '0.9rem'
                    }}
                  >
                    Email Templates ({masterTemplates.length})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(searchResults.length > 0 || (activeSearchId && activeSearchId !== 'Not available')) && (
                    <button
                      onClick={handleBackToResults}
                      className="table-btn"
                      style={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #3b82f6',
                        color: '#60a5fa',
                        fontWeight: 'bold',
                        padding: '0.5rem 1rem',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        cursor: 'pointer'
                      }}
                      title="Return to the active search results without re-querying or consuming API credits"
                    >
                      <span>&larr; Back to Search Results</span>
                      {activeSearchId && activeSearchId !== 'Not available' && (
                        <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>({activeSearchId})</span>
                      )}
                    </button>
                  )}

                  {outreachSubView === 'shortlist' && (
                    <button
                      onClick={handleOpenCreatePackModal}
                      disabled={selectedShortlistIds.size === 0}
                      className="analyse-btn-green"
                      style={{
                        padding: '0.5rem 1.1rem',
                        fontSize: '0.9rem',
                        opacity: selectedShortlistIds.size === 0 ? 0.5 : 1,
                        cursor: selectedShortlistIds.size === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      + Create Outreach Pack ({selectedShortlistIds.size} Selected)
                    </button>
                  )}


                </div>
              </div>
            )}

            {/* Sub-view 1: Shortlisted Prospects */}
            {outreachSubView === 'shortlist' && (() => {
              const unassignedProspects = outreachList.filter(item => !getProspectAssignedPack(item));
              const unassignedCount = unassignedProspects.length;
              const assignedCount = outreachList.length - unassignedCount;

              return (
                <div className="results-table-container">
                  <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem' }}>Outreach Shortlist</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {unassignedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedShortlistIds(new Set(unassignedProspects.map(item => item.id || item.domain)));
                          }}
                          className="table-btn"
                          style={{
                            backgroundColor: '#1e293b',
                            border: '1px solid #10b981',
                            color: '#34d399',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
                        >
                          Select Unassigned ({unassignedCount})
                        </button>
                      )}
                      {selectedShortlistIds.size > 0 && (
                        <button
                          onClick={() => setSelectedShortlistIds(new Set())}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          Deselect All
                        </button>
                      )}
                      <span style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 'bold' }}>
                        {outreachList.length} shortlisted ({unassignedCount} unassigned, {assignedCount} in packs)
                      </span>
                    </div>
                  </div>

                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={outreachList.length > 0 && selectedShortlistIds.size === outreachList.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedShortlistIds(new Set(outreachList.map(item => item.id || item.domain)));
                              } else {
                                setSelectedShortlistIds(new Set());
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </th>
                        <th>Domain / Business</th>
                        <th>Source</th>
                        <th>Contact / Email</th>
                        <th>Pack Status</th>
                        <th>Search ID</th>
                        <th>Search Phrase</th>
                        <th>Location</th>
                        <th>Rank / Rating</th>
                        <th>Opportunity Score</th>
                        <th>Commercial Strength</th>
                        <th>Date Shortlisted</th>
                        <th className="action-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isOutreachLoading && outreachList.length === 0 ? (
                        <tr>
                          <td colSpan="13" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                            Loading outreach shortlist...
                          </td>
                        </tr>
                      ) : outreachList.length === 0 ? (
                        <tr>
                          <td colSpan="13" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                            <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>No prospects in your Outreach List yet.</p>
                            <p style={{ fontSize: '0.9rem', margin: 0 }}>Add prospects from any Search Results table or Lead Opportunity Dashboard.</p>
                          </td>
                        </tr>
                      ) : (
                        outreachList.map((item, idx) => {
                          const score = item.opportunityScore;
                          const itemKey = item.id || item.domain;
                          const isSelected = selectedShortlistIds.has(itemKey);
                          const assignedPack = getProspectAssignedPack(item);
                          const isLocal = item.searchType === 'GMB' || item.searchType === 'local';

                          const contactEmail = item.contactEmail || (item.allFoundEmails && item.allFoundEmails[0]) || item.analysisData?.contactEmail;
                          const phone = item.phone || item.analysisData?.phone;
                          const isAssignedPackLocal = assignedPack && isPackLocal(assignedPack);

                          let rowBg = 'transparent';
                          if (isSelected) {
                            rowBg = isLocal ? 'rgba(16, 185, 129, 0.16)' : 'rgba(37, 99, 235, 0.12)';
                          } else if (isLocal) {
                            rowBg = 'rgba(16, 185, 129, 0.05)';
                          }

                          return (
                            <tr key={item.id || idx} style={{ backgroundColor: rowBg }}>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedShortlistIds);
                                    if (e.target.checked) next.add(itemKey);
                                    else next.delete(itemKey);
                                    setSelectedShortlistIds(next);
                                  }}
                                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                              </td>
                              <td>
                                <div>
                                  {item.url ? (
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="table-link" style={{ fontWeight: 'bold' }}>
                                      {item.businessName || item.domain || item.url}
                                    </a>
                                  ) : (
                                    <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{item.businessName || item.domain}</span>
                                  )}
                                  {item.businessName && item.domain && item.businessName !== item.domain && (
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                                      {item.domain}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  backgroundColor: isLocal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                  color: isLocal ? '#34d399' : '#38bdf8',
                                  border: isLocal ? '1px solid #10b981' : '1px solid #0284c7',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '4px',
                                  fontWeight: 'bold',
                                  fontSize: '0.8rem'
                                }}>
                                  {isLocal ? 'Local' : 'Organic'}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {contactEmail ? (
                                    <span style={{ color: '#38bdf8', fontWeight: '600', fontSize: '0.85rem' }}>
                                      ✉ {contactEmail}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                      No email found
                                    </span>
                                  )}
                                  {phone && (
                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                      📞 {phone}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                {assignedPack ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPack(assignedPack)}
                                    className="table-btn"
                                    style={{
                                      backgroundColor: isAssignedPackLocal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                      color: isAssignedPackLocal ? '#34d399' : '#38bdf8',
                                      border: isAssignedPackLocal ? '1px solid #10b981' : '1px solid #0284c7',
                                      padding: '0.2rem 0.6rem',
                                      borderRadius: '4px',
                                      fontWeight: 'bold',
                                      fontSize: '0.85rem',
                                      cursor: 'pointer'
                                    }}
                                    title={`Assigned to Outreach Pack ${assignedPack.packId} — click to view pack`}
                                  >
                                    {assignedPack.packId}
                                  </button>
                                ) : (
                                  <span
                                    style={{
                                      color: '#f59e0b',
                                      fontWeight: '600',
                                      fontSize: '0.875rem',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title="Not yet assigned to any outreach pack"
                                  >
                                    Waiting
                                  </span>
                                )}
                              </td>
                            <td>
                              {item.searchId ? (
                                <span style={{ 
                                  backgroundColor: 'rgba(96, 165, 250, 0.1)', 
                                  color: '#60a5fa', 
                                  padding: '0.15rem 0.5rem', 
                                  borderRadius: '4px',
                                  fontWeight: 'bold',
                                  fontSize: '0.85rem'
                                }}>
                                  {item.searchId}
                                </span>
                              ) : (
                                <span style={{ color: '#64748b' }}>-</span>
                              )}
                            </td>
                            <td>{item.searchPhrase || 'Not available'}</td>
                            <td>{item.location || 'Anywhere'}</td>
                            <td style={{ fontWeight: 'bold', color: '#60a5fa' }}>
                              {isLocal && item.rating !== null && item.rating !== undefined ? (
                                <span>⭐ {item.rating}</span>
                              ) : (
                                item.rank ? `#${item.rank}` : '-'
                              )}
                            </td>
                            <td>
                              {score !== null && score !== undefined ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <span style={{ 
                                    color: score >= 70 ? '#ef4444' : (score >= 40 ? '#f59e0b' : '#10b981'),
                                    marginRight: '6px',
                                    fontSize: '1.1rem',
                                    lineHeight: '1'
                                  }}>●</span>
                                  {score >= 60 && (
                                    <span style={{ color: '#f59e0b', marginRight: '4px', fontSize: '1rem', fontWeight: 'bold' }}>★</span>
                                  )}
                                  <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#ffffff' }}>
                                    {score}
                                  </span>
                                </span>
                              ) : (
                                <span style={{ color: '#64748b' }}>-</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                  {item.commercialStrengthStars || '★★★☆☆'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                                  {item.commercialStrengthLabel || 'Good Lead'}
                                </span>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                              {formatLastAnalysed(item.shortlistedAt)}
                            </td>
                            <td className="action-cell">
                              <button 
                                onClick={() => {
                                  const analysisItem = item.analysisData || {
                                    domain: item.domain,
                                    url: item.url,
                                    searchId: item.searchId,
                                    searchType: item.searchType || 'Organic',
                                    searchKeyword: item.searchPhrase || 'Any',
                                    location: item.location || 'Anywhere',
                                    rank: item.rank || 0,
                                    leadOpportunityScore: { score: item.opportunityScore, band: item.opportunityBand },
                                    leadPriority: { stars: item.commercialStrengthStars, label: item.commercialStrengthLabel },
                                    gbp: { status: item.gbpStatus }
                                  };
                                  handleAnalyse(analysisItem);
                                }}
                                className="analyse-btn-green"
                                style={{ marginRight: '8px', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                              >
                                View Analysis
                              </button>
                              <button 
                                onClick={() => handleRemoveFromOutreach(item.id || item.domain)}
                                className="table-btn"
                                style={{ backgroundColor: '#ef4444', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

            {/* Sub-view 2: Outreach Packs / History Table */}
            {outreachSubView === 'packs' && (
              <div className="results-table-container">
                <div style={{ padding: '1.5rem 1.5rem 0.5rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem' }}>Outreach Packs History</h2>
                    <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
                      Permanent server-backed campaign batches. Click any Pack ID to view prospect emails, drafts and statuses.
                    </p>
                  </div>
                  <span style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 'bold' }}>
                    {outreachPacks.length} {outreachPacks.length === 1 ? 'pack' : 'packs'} created
                  </span>
                </div>

                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Pack ID</th>
                      <th>Pack Name</th>
                      <th>Created Date</th>
                      <th>Prospects</th>
                      <th>Pack Status</th>
                      <th>Sent Date / Time</th>
                      <th className="action-cell">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isPacksLoading && outreachPacks.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                          Loading outreach packs...
                        </td>
                      </tr>
                    ) : outreachPacks.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                          <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>No Outreach Packs created yet.</p>
                          <p style={{ fontSize: '0.9rem', margin: 0 }}>Select prospects from your Shortlist and click "Create Outreach Pack" to get started.</p>
                        </td>
                      </tr>
                    ) : (
                      outreachPacks.map((pack) => {
                        const statusColors = {
                          'Draft': { bg: 'rgba(100, 116, 139, 0.2)', text: '#94a3b8' },
                          'Ready': { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
                          'Sent': { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
                          'Partially Sent': { bg: 'rgba(168, 85, 247, 0.2)', text: '#c084fc' },
                          'Failed': { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' }
                        };
                        const sc = statusColors[pack.status] || statusColors['Draft'];

                        const isLocal = isPackLocal(pack);
                        return (
                          <tr key={pack.packId || pack.id}>
                            <td>
                              <button
                                onClick={() => handleOpenPack(pack)}
                                className="table-btn"
                                style={{
                                  backgroundColor: isLocal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                  border: isLocal ? '1px solid #10b981' : '1px solid #0284c7',
                                  color: isLocal ? '#34d399' : '#38bdf8',
                                  fontWeight: 'bold',
                                  fontSize: '0.95rem'
                                }}
                              >
                                {pack.packId}
                              </button>
                            </td>
                            <td>
                              <span style={{ fontWeight: '600', color: '#f8fafc' }}>{pack.name}</span>
                            </td>
                            <td>{formatLastAnalysed(pack.createdAt)}</td>
                            <td style={{ fontWeight: 'bold', color: isLocal ? '#34d399' : '#60a5fa' }}>
                              {pack.prospectsCount || pack.prospects?.length || 0} Prospects
                            </td>
                            <td>
                              <span style={{
                                backgroundColor: sc.bg,
                                color: sc.text,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                fontSize: '0.85rem'
                              }}>
                                {pack.status || 'Draft'}
                              </span>
                            </td>
                            <td style={{ color: pack.sentAt ? '#10b981' : '#64748b', fontSize: '0.85rem' }}>
                              {pack.sentAt ? formatLastAnalysed(pack.sentAt) : '-'}
                            </td>
                            <td className="action-cell">
                              <button
                                onClick={() => handleOpenPack(pack)}
                                className="analyse-btn-green"
                                style={{ marginRight: '8px', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                              >
                                Open Pack
                              </button>
                              <button
                                onClick={() => handleDeletePack(pack.packId)}
                                className="table-btn"
                                style={{ backgroundColor: '#ef4444', padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-view 3: Master Email Templates Management */}
            {outreachSubView === 'templates' && (() => {
              const organicTemplates = sortTemplatesNumbered(masterTemplates.filter(t => getTemplateClassification(t) === 'organic'));
              const localTemplates = sortTemplatesNumbered(masterTemplates.filter(t => getTemplateClassification(t) === 'local'));
              const masterTemplatesList = sortTemplatesNumbered(masterTemplates.filter(t => getTemplateClassification(t) === 'master'));
              
              let displayedTemplates = [];
              if (templateTab === 'organic') {
                displayedTemplates = organicTemplates;
              } else if (templateTab === 'local') {
                displayedTemplates = localTemplates;
              } else if (templateTab === 'master') {
                displayedTemplates = masterTemplatesList;
              }

              return (
                <div className="results-table-container">
                  <div style={{ padding: '1.5rem 1.5rem 0.75rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem' }}>Master Email Templates</h2>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
                        Reusable master templates for outreach campaigns. Selecting a template in a pack creates an independent pack copy.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', color: '#60a5fa', fontWeight: 'bold' }}>
                        {displayedTemplates.length} {displayedTemplates.length === 1 ? 'template' : 'templates'}
                      </span>
                      <button
                        onClick={handleOpenCreateTemplateModal}
                        className="analyse-btn-green"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                      >
                        + Create Master Template
                      </button>
                    </div>
                  </div>

                  {/* 3 Tabs: MASTER EMAIL TEMPLATES | ORGANIC | LOCAL */}
                  <div style={{ padding: '0 1.5rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid #334155' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateTab('master')}
                      style={{
                        padding: '0.65rem 1.25rem',
                        border: 'none',
                        borderBottom: templateTab === 'master' ? '3px solid #3b82f6' : '3px solid transparent',
                        backgroundColor: 'transparent',
                        color: templateTab === 'master' ? '#ffffff' : '#94a3b8',
                        fontWeight: templateTab === 'master' ? 'bold' : '500',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                      id="tab-templates-master"
                    >
                      <span>MASTER EMAIL TEMPLATES</span>
                      <span style={{
                        backgroundColor: templateTab === 'master' ? '#2563eb' : '#334155',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontWeight: 'bold'
                      }}>
                        {masterTemplatesList.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTemplateTab('organic')}
                      style={{
                        padding: '0.65rem 1.25rem',
                        border: 'none',
                        borderBottom: templateTab === 'organic' ? '3px solid #3b82f6' : '3px solid transparent',
                        backgroundColor: 'transparent',
                        color: templateTab === 'organic' ? '#ffffff' : '#94a3b8',
                        fontWeight: templateTab === 'organic' ? 'bold' : '500',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                      id="tab-templates-organic"
                    >
                      <span>ORGANIC</span>
                      <span style={{
                        backgroundColor: templateTab === 'organic' ? '#2563eb' : '#334155',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontWeight: 'bold'
                      }}>
                        {organicTemplates.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTemplateTab('local')}
                      style={{
                        padding: '0.65rem 1.25rem',
                        border: 'none',
                        borderBottom: templateTab === 'local' ? '3px solid #10b981' : '3px solid transparent',
                        backgroundColor: 'transparent',
                        color: templateTab === 'local' ? '#ffffff' : '#94a3b8',
                        fontWeight: templateTab === 'local' ? 'bold' : '500',
                        fontSize: '0.95rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                      id="tab-templates-local"
                    >
                      <span>LOCAL</span>
                      <span style={{
                        backgroundColor: templateTab === 'local' ? '#059669' : '#334155',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontWeight: 'bold'
                      }}>
                        {localTemplates.length}
                      </span>
                    </button>
                  </div>

                  <div style={{ padding: '1.25rem 1.5rem 2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {isTemplatesLoading && masterTemplates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                        Loading email templates...
                      </div>
                    ) : displayedTemplates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #334155' }}>
                        <p style={{ fontSize: '1.1rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>No templates found in {templateTab === 'master' ? 'MASTER' : templateTab.toUpperCase()} tab.</p>
                        <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
                          {templateTab === 'master' 
                            ? 'No general / master templates currently stored. Create one or select Organic / Local tab.' 
                            : `No ${templateTab} templates currently stored.`}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                        {displayedTemplates.map((tpl, idx) => {
                          const isTplLocal = tpl.templateType === 'local';
                          const isTplOrganic = tpl.templateType === 'organic';
                          const cleanName = (tpl.name || '').replace(/^\(?\d+\)?[-.\s]*/, '');
                          const displayTitle = `${idx + 1}. ${cleanName || tpl.name}`;

                          return (
                            <div
                              key={tpl.id}
                              style={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
                              }}
                            >
                              {/* Header: Title + Category + Meta + Action Buttons */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: '700' }}>
                                      {displayTitle}
                                    </h3>
                                    <span style={{
                                      backgroundColor: isTplLocal ? 'rgba(16, 185, 129, 0.15)' : isTplOrganic ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                      color: isTplLocal ? '#34d399' : isTplOrganic ? '#60a5fa' : '#94a3b8',
                                      border: isTplLocal ? '1px solid #10b981' : isTplOrganic ? '1px solid #3b82f6' : '1px solid #475569',
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: 'bold'
                                    }}>
                                      {isTplLocal ? 'Local' : isTplOrganic ? 'Organic' : 'Master'}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    ID: {tpl.id} &bull; Updated: {formatLastAnalysed(tpl.updatedAt || tpl.createdAt)}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button
                                    onClick={() => handleOpenEditTemplateModal(tpl)}
                                    className="table-btn"
                                    style={{
                                      backgroundColor: '#1e293b',
                                      border: '1px solid #3b82f6',
                                      color: '#60a5fa',
                                      padding: '0.35rem 0.75rem',
                                      fontSize: '0.85rem',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                    className="table-btn"
                                    style={{
                                      backgroundColor: '#1e293b',
                                      border: '1px solid #ef4444',
                                      color: '#f87171',
                                      padding: '0.35rem 0.75rem',
                                      fontSize: '0.85rem'
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>

                              {/* Two Columns: MASTER TEMPLATE (Left) | PERSONALISED EXAMPLE (Right) */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
                                {/* Left Column: Master Template */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span>MASTER TEMPLATE</span>
                                  </div>
                                  <div style={{ backgroundColor: '#1e293b', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #334155', fontSize: '0.85rem' }}>
                                    <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Subject: </span>
                                    <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{tpl.subject}</span>
                                  </div>
                                  <div style={{
                                    backgroundColor: '#1e293b',
                                    padding: '0.85rem 1rem',
                                    borderRadius: '6px',
                                    border: '1px solid #334155',
                                    fontSize: '0.85rem',
                                    color: '#cbd5e1',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.5',
                                    flexGrow: 1
                                  }}>
                                    {tpl.body}
                                  </div>
                                </div>

                                {/* Right Column: Personalised Example Preview */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#10b981', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span>PERSONALISED EXAMPLE</span>
                                  </div>
                                  <div style={{ backgroundColor: '#1e293b', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.35)', fontSize: '0.85rem' }}>
                                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>Subject: </span>
                                    <span style={{ color: '#f1f5f9' }}>{renderTemplateDemoPreview(tpl.subject, currentUser?.workspace)}</span>
                                  </div>
                                  <div style={{
                                    backgroundColor: '#1e293b',
                                    padding: '0.85rem 1rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(16, 185, 129, 0.35)',
                                    fontSize: '0.85rem',
                                    color: '#f1f5f9',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.5',
                                    flexGrow: 1
                                  }}>
                                    {renderTemplateDemoPreview(tpl.body, currentUser?.workspace)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Outreach Subview: Pack Detail */}
            {outreachSubView === 'pack-detail' && activePack && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Pack Detail Header Card */}
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}>
                  {/* Row 1: Back + Pack Badge + Pack Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setOutreachSubView('packs');
                        setSelectedProspectIdsInPack(new Set());
                      }}
                      className="table-btn"
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        color: '#cbd5e1',
                        padding: '0.5rem 1rem',
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem'
                      }}
                    >
                      &larr; Back to Packs
                    </button>
                    {(searchResults.length > 0 || (activeSearchId && activeSearchId !== 'Not available')) && (
                      <button
                        onClick={handleBackToResults}
                        className="table-btn"
                        style={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #3b82f6',
                          color: '#60a5fa',
                          fontWeight: 'bold',
                          padding: '0.5rem 1rem',
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          cursor: 'pointer'
                        }}
                        title="Return to the active search results without re-querying or consuming API credits"
                      >
                        <span>&larr; Back to Search Results</span>
                        {activeSearchId && activeSearchId !== 'Not available' && (
                          <span style={{ color: '#93c5fd', fontSize: '0.8rem' }}>({activeSearchId})</span>
                        )}
                      </button>
                    )}
                    <span style={{
                      backgroundColor: isPackLocal(activePack) ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.25)',
                      color: isPackLocal(activePack) ? '#34d399' : '#60a5fa',
                      border: isPackLocal(activePack) ? '1px solid #10b981' : '1px solid #3b82f6',
                      padding: '0.4rem 0.9rem',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '1rem'
                    }}>
                      Pack {activePack.packId} ({activePack.prospectsCount || activePack.prospects?.length || 0})
                    </span>
                    <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.35rem', fontWeight: 'bold' }}>
                      {activePack.name}
                    </h2>
                  </div>

                  {/* Row 2: Metadata */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', color: '#94a3b8', fontSize: '0.875rem', flexWrap: 'wrap' }}>
                    <div>
                      Created: <span style={{ color: '#cbd5e1' }}>{formatLastAnalysed(activePack.createdAt)}</span>
                    </div>
                    <div>
                      Prospects: <span style={{ color: '#cbd5e1', fontWeight: 'bold' }}>{activePack.prospectsCount || activePack.prospects?.length || 0}</span>
                    </div>
                    <div>
                      Sent Date: <span style={{ color: activePack.sentAt ? '#10b981' : '#cbd5e1' }}>{activePack.sentAt ? formatLastAnalysed(activePack.sentAt) : 'Not Sent'}</span>
                    </div>
                  </div>

                  {/* Pack Email Template Selection & Customization */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    backgroundColor: '#1e293b',
                    padding: '1rem 1.25rem',
                    borderRadius: '6px',
                    border: '1px solid #334155'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <label style={{ color: '#cbd5e1', fontSize: '0.9rem', fontWeight: 'bold' }}>
                          Select Email Template:
                        </label>
                        <select
                          value={selectedMasterTemplateIdForPack || ''}
                          onChange={(e) => handleApplyMasterTemplateToPack(e.target.value)}
                          className="search-input"
                          style={{
                            backgroundColor: '#0f172a',
                            borderColor: '#3b82f6',
                            color: '#ffffff',
                            fontWeight: '600',
                            padding: '0.45rem 0.85rem',
                            fontSize: '0.9rem',
                            minWidth: '300px',
                            cursor: 'pointer'
                          }}
                        >
                          {renderTemplateOptions(masterTemplates, '-- Select Reusable Master Template --')}
                        </select>
                      </div>

                      <button
                        onClick={openTemplateModal}
                        className="table-btn"
                        style={{
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          padding: '0.45rem 1rem',
                          fontSize: '0.85rem'
                        }}
                      >
                        Edit Template for this Pack
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#cbd5e1', fontSize: '0.875rem' }}>
                      <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>Active Pack Subject:</span>
                      <span style={{ color: '#ffffff' }}>
                        {activePack.templateSubject || 'Partnership enquiry: {{trade}} in {{location}} — The Search Equation'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action Bar Above Table */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1.25rem',
                  backgroundColor: '#1e293b',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  margin: '0.5rem 0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                      <strong>{selectedProspectIdsInPack.size}</strong> of {activePack.prospects?.length || 0} prospects selected
                    </span>
                    {selectedProspectIdsInPack.size > 0 && (
                      <button
                        onClick={() => setSelectedProspectIdsInPack(new Set())}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
                      >
                        Deselect All
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                      onClick={() => {
                        setPreviewRecipientIndex(0);
                        setIsPreviewModalOpen(true);
                      }}
                      disabled={selectedProspectIdsInPack.size === 0}
                      className="table-btn"
                      style={{
                        padding: '0.65rem 1.25rem',
                        fontSize: '0.95rem',
                        fontWeight: 'bold',
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        opacity: selectedProspectIdsInPack.size === 0 ? 0.5 : 1,
                        cursor: selectedProspectIdsInPack.size === 0 ? 'not-allowed' : 'pointer'
                      }}
                      title={selectedProspectIdsInPack.size === 0 ? "Select at least one prospect to preview" : `Preview rendered emails for ${selectedProspectIdsInPack.size} selected prospects`}
                    >
                      👁️ Preview Emails ({selectedProspectIdsInPack.size})
                    </button>
                    <button
                      onClick={() => { fetchSenderStatus(); setIsSendConfirmModalOpen(true); }}
                      disabled={selectedProspectIdsInPack.size === 0}
                      className={selectedProspectIdsInPack.size > 0 ? "analyse-btn-green" : "table-btn"}
                      style={{
                        padding: '0.65rem 1.5rem',
                        fontSize: '0.95rem',
                        fontWeight: 'bold',
                        opacity: selectedProspectIdsInPack.size === 0 ? 0.5 : 1,
                        cursor: selectedProspectIdsInPack.size === 0 ? 'not-allowed' : 'pointer'
                      }}
                      title={selectedProspectIdsInPack.size === 0 ? "Select at least one prospect to send" : `Send personalised emails to ${selectedProspectIdsInPack.size} selected prospects`}
                    >
                      Send Selected ({selectedProspectIdsInPack.size})
                    </button>
                  </div>
                </div>

                {/* Simplified Prospects Table in Pack */}
                <div className="results-table-container">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={activePack.prospects?.length > 0 && selectedProspectIdsInPack.size === activePack.prospects.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProspectIdsInPack(new Set(activePack.prospects.map(p => p.id || p.domain)));
                              } else {
                                setSelectedProspectIdsInPack(new Set());
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </th>
                        <th>Domain</th>
                        <th>Rank & Score</th>
                        <th>Contact Email</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePack.prospects?.map((prospect, pIdx) => {
                        const prospectKey = prospect.id || prospect.domain;
                        const isSelected = selectedProspectIdsInPack.has(prospectKey);
                        const warning = getContactHistoryWarning(prospect.domain, activePack.packId);

                        // Collect all valid unique emails matching prospect's own domain
                        const emailsList = Array.from(new Set([prospect.contactEmail, ...(prospect.allFoundEmails || [])].filter(Boolean)))
                          .filter(em => isDomainMatch(em, prospect.domain));

                        // Determine display status text
                        let displayStatus = 'No Email Found';
                        if (prospect.sendStatus === 'Sent') {
                          displayStatus = 'Sent';
                        } else if (prospect.sendStatus === 'Failed') {
                          displayStatus = 'Failed';
                        } else if (emailsList.length > 0 || (prospect.contactEmail && isDomainMatch(prospect.contactEmail, prospect.domain))) {
                          displayStatus = 'Email Found';
                        }

                        const statusStyle = {
                          'Email Found': { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
                          'No Email Found': { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
                          'Sent': { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
                          'Failed': { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' }
                        }[displayStatus] || { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' };

                        return (
                          <tr key={prospectKey || pIdx} style={{ backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent' }}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const next = new Set(selectedProspectIdsInPack);
                                  if (e.target.checked) next.add(prospectKey);
                                  else next.delete(prospectKey);
                                  setSelectedProspectIdsInPack(next);
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td>
                              <div>
                                {prospect.url ? (
                                  <a href={prospect.url} target="_blank" rel="noopener noreferrer" className="table-link" style={{ fontWeight: 'bold' }}>
                                    {prospect.businessName || prospect.domain || prospect.url}
                                  </a>
                                ) : (
                                  <span style={{ fontWeight: 'bold', color: '#ffffff' }}>{prospect.businessName || prospect.domain}</span>
                                )}
                                {prospect.businessName && prospect.domain && prospect.businessName !== prospect.domain && (
                                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                                    {prospect.domain}
                                  </div>
                                )}
                                {warning && (
                                  <span style={{
                                    marginLeft: '6px',
                                    fontSize: '0.75rem',
                                    color: isPackLocal(warning.packId) ? '#34d399' : '#38bdf8',
                                    backgroundColor: isPackLocal(warning.packId) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                    border: isPackLocal(warning.packId) ? '1px solid #10b981' : '1px solid #0284c7',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px',
                                    fontWeight: 'bold'
                                  }} title={`Already in Pack ${warning.packId}`}>
                                    {warning.packId}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {prospect.rating !== null && prospect.rating !== undefined ? (
                                  <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.85rem' }}>⭐ {prospect.rating}</span>
                                ) : (
                                  <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>#{prospect.rank || '-'}</span>
                                )}
                                {prospect.opportunityScore !== null && prospect.opportunityScore !== undefined ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.9rem' }}>
                                    <span style={{ color: prospect.opportunityScore >= 70 ? '#ef4444' : (prospect.opportunityScore >= 40 ? '#f59e0b' : '#10b981'), marginRight: '4px' }}>●</span>
                                    {prospect.opportunityScore >= 60 && <span style={{ color: '#f59e0b', marginRight: '2px' }}>★</span>}
                                    <strong style={{ color: '#ffffff' }}>{prospect.opportunityScore}</strong>
                                  </span>
                                ) : (
                                  <span style={{ color: '#64748b', fontSize: '0.85rem' }}>-</span>
                                )}
                              </div>
                            </td>
                            <td style={{ minWidth: '220px' }}>
                              {editingProspectId === prospectKey ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  <input
                                    type="email"
                                    value={editingEmailValue}
                                    onChange={(e) => setEditingEmailValue(e.target.value)}
                                    placeholder="e.g. hello@domain.co.uk"
                                    autoComplete="off"
                                    data-lpignore="true"
                                    data-1p-ignore="true"
                                    style={{
                                      backgroundColor: '#0f172a',
                                      color: '#ffffff',
                                      border: '1px solid #3b82f6',
                                      borderRadius: '4px',
                                      padding: '0.25rem 0.5rem',
                                      fontSize: '0.85rem',
                                      width: '180px'
                                    }}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveProspectEmail(activePack.packId, prospectKey, editingEmailValue);
                                      if (e.key === 'Escape') setEditingProspectId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleSaveProspectEmail(activePack.packId, prospectKey, editingEmailValue)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 'bold' }}
                                    title="Save Email"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => setEditingProspectId(null)}
                                    className="table-btn"
                                    style={{ backgroundColor: '#475569', color: '#cbd5e1', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                  <div>
                                    {prospect.contactEmail ? (
                                      <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.9rem' }}>
                                        {prospect.contactEmail}
                                      </span>
                                    ) : emailsList.length > 0 ? (
                                      <span style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: '0.9rem' }}>
                                        {emailsList[0]}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                        No email found
                                      </span>
                                    )}
                                    {prospect.manualEmail && (
                                      <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: '0.1rem 0.35rem', borderRadius: '3px' }} title="Manually saved contact email">
                                        Manual
                                      </span>
                                    )}
                                    {prospect.phone && (
                                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                                        📞 {prospect.phone}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setEditingProspectId(prospectKey);
                                      setEditingEmailValue(prospect.contactEmail || emailsList[0] || '');
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      fontSize: '0.9rem',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      transition: 'color 0.2s'
                                    }}
                                    title="Edit contact email"
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#38bdf8'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                                  >
                                    ✏️
                                  </button>
                                </div>
                              )}
                            </td>
                            <td>
                              <span style={{
                                backgroundColor: statusStyle.bg,
                                color: statusStyle.color,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                display: 'inline-block'
                              }}>
                                {displayStatus}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal: Create Outreach Pack */}
            {isCreatingPackModalOpen && (
              <div className="modal-overlay" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '1.5rem'
              }}>
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  width: '100%',
                  maxWidth: '680px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: '2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.4rem' }}>Create New Outreach Pack</h3>
                      <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                        Grouping <strong>{selectedShortlistIds.size} selected prospects</strong> into an outreach campaign pack.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsCreatingPackModalOpen(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>Pack Name / Description</label>
                    <input
                      type="text"
                      value={newPackNameInput}
                      onChange={(e) => setNewPackNameInput(e.target.value)}
                      placeholder="e.g. Window Shutters Bristol"
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Master Template Selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>Choose Email Template</label>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Personalised per recipient upon sending</span>
                    </div>
                    <select
                      value={newPackTemplateId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        setNewPackTemplateId(selectedId);
                        const found = masterTemplates.find(t => t.id === selectedId);
                        if (found) {
                          setNewPackSubjectInput(found.subject);
                          setNewPackBodyInput(stripLeadingGreeting(found.body));
                        }
                      }}
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box', cursor: 'pointer', backgroundColor: '#1e293b' }}
                    >
                      {renderTemplateOptions(masterTemplates, '-- Choose a Master Template --')}
                    </select>
                  </div>

                  {/* Editable Template Subject */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>Subject Line</label>
                    <input
                      type="text"
                      value={newPackSubjectInput}
                      onChange={(e) => setNewPackSubjectInput(e.target.value)}
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  {/* Editable Template Body */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>
                      Email Body <span style={{ color: '#64748b', fontWeight: 'normal' }}>(Salutation is automatically prepended upon sending)</span>
                    </label>
                    <textarea
                      value={newPackBodyInput}
                      onChange={(e) => setNewPackBodyInput(e.target.value)}
                      rows={8}
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '0.85rem',
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => setIsCreatingPackModalOpen(false)}
                      className="table-btn"
                      style={{ backgroundColor: '#334155', color: '#cbd5e1' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleCreatePackSubmit(newPackNameInput.trim(), newPackSubjectInput.trim(), newPackBodyInput.trim())}
                      className="analyse-btn-green"
                      style={{ padding: '0.6rem 1.5rem', fontWeight: 'bold' }}
                    >
                      Create Pack & Find Contacts
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: View / Edit Pack Email Template */}
            {isTemplateModalOpen && activePack && (
              <div className="modal-overlay" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '1.5rem'
              }}>
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '10px',
                  width: '100%',
                  maxWidth: '750px',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: '2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.9)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.35rem' }}>
                        Outreach Email Template — {activePack.packId}
                      </h3>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                        Applied to all prospects in this pack. Personalises automatically per recipient.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsTemplateModalOpen(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  </div>

                  {/* Non-editable greeting note */}
                  <div style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.65rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    color: '#cbd5e1',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ color: '#38bdf8', fontSize: '1.1rem' }}>ℹ️</span>
                    <span><strong>Greeting is added automatically for each recipient.</strong> (e.g. <em>Hi Mark,</em> or <em>Hi there,</em>). Email body begins directly after the greeting.</span>
                  </div>

                  {/* Load from Master Template */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>Load from Master Template</label>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Populates subject and body below for this pack</span>
                    </div>
                    <select
                      value={selectedMasterTemplateIdForPack}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        setSelectedMasterTemplateIdForPack(selectedId);
                        const found = masterTemplates.find(t => t.id === selectedId);
                        if (found) {
                          setEditingTemplateSubject(found.subject);
                          setEditingTemplateBody(stripLeadingGreeting(found.body));
                        }
                      }}
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box', cursor: 'pointer', backgroundColor: '#1e293b' }}
                    >
                      {renderTemplateOptions(masterTemplates, '-- Choose a Master Template --')}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>Subject Line</label>
                    <input
                      type="text"
                      value={editingTemplateSubject}
                      onChange={(e) => setEditingTemplateSubject(e.target.value)}
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 'bold' }}>Email Body</label>
                      <button
                        type="button"
                        onClick={() => {
                          const firstPhrase = activePack.prospects?.[0]?.searchPhrase || activePack.prospects?.[0]?.searchKeyword || '';
                          const firstLoc = activePack.prospects?.[0]?.location || '';
                          const regenerated = generatePartnershipTemplate({ searchKeyword: firstPhrase, location: firstLoc });
                          setEditingTemplateSubject(regenerated.subject);
                          setEditingTemplateBody(stripLeadingGreeting(regenerated.body));
                        }}
                        style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        🔄 Reset to Default Template
                      </button>
                    </div>
                    <textarea
                      value={editingTemplateBody}
                      onChange={(e) => setEditingTemplateBody(e.target.value)}
                      rows={14}
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '1rem',
                        fontSize: '0.9rem',
                        lineHeight: '1.6',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => setIsTemplateModalOpen(false)}
                      className="table-btn"
                      style={{ backgroundColor: '#334155', color: '#cbd5e1' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const cleanedBody = stripLeadingGreeting(editingTemplateBody);
                        handleUpdatePack(activePack.packId, {
                          templateSubject: editingTemplateSubject.trim(),
                          templateBody: cleanedBody
                        });
                        setEditingTemplateBody(cleanedBody);
                        setIsTemplateModalOpen(false);
                      }}
                      className="analyse-btn-green"
                    >
                      Save Template
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Preview Emails */}
            {isPreviewModalOpen && activePack && (() => {
              const recipients = getSelectedRecipientsList();
              const currentIndex = Math.min(previewRecipientIndex, Math.max(0, recipients.length - 1));
              const current = recipients[currentIndex];

              return (
                <div className="modal-overlay" style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.82)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 99999,
                  padding: '1.5rem'
                }}>
                  <div style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    width: '100%',
                    maxWidth: '820px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.9)'
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontSize: '1.3rem' }}>👁️</span>
                          <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.35rem' }}>
                            Preview Outreach Emails — {activePack.packId}
                          </h3>
                        </div>
                        <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                          Exact personalised rendering for {recipients.length} selected recipient{recipients.length === 1 ? '' : 's'}.
                        </p>
                      </div>
                      <button
                        onClick={() => setIsPreviewModalOpen(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                        title="Close preview"
                      >
                        &times;
                      </button>
                    </div>

                    {recipients.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        No prospects currently selected to preview.
                      </div>
                    ) : (
                      <>
                        {/* Stepper Navigation */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#1e293b',
                          padding: '0.6rem 1rem',
                          borderRadius: '8px',
                          border: '1px solid #334155'
                        }}>
                          <button
                            type="button"
                            onClick={() => setPreviewRecipientIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentIndex === 0}
                            className="table-btn"
                            style={{
                              padding: '0.4rem 0.9rem',
                              fontSize: '0.85rem',
                              opacity: currentIndex === 0 ? 0.4 : 1,
                              cursor: currentIndex === 0 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            &larr; Previous
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: '#cbd5e1', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              Recipient {currentIndex + 1} of {recipients.length}
                            </span>
                            <span style={{ color: '#64748b' }}>|</span>
                            <span style={{ color: '#38bdf8', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                              {current.domain}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setPreviewRecipientIndex(prev => Math.min(recipients.length - 1, prev + 1))}
                            disabled={currentIndex === recipients.length - 1}
                            className="table-btn"
                            style={{
                              padding: '0.4rem 0.9rem',
                              fontSize: '0.85rem',
                              opacity: currentIndex === recipients.length - 1 ? 0.4 : 1,
                              cursor: currentIndex === recipients.length - 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Next &rarr;
                          </button>
                        </div>

                        {/* Quick Selection Tabs / Pills */}
                        {recipients.length > 1 && (
                          <div style={{
                            display: 'flex',
                            gap: '0.4rem',
                            overflowX: 'auto',
                            paddingBottom: '0.3rem'
                          }}>
                            {recipients.map((r, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setPreviewRecipientIndex(idx)}
                                style={{
                                  padding: '0.3rem 0.7rem',
                                  fontSize: '0.8rem',
                                  borderRadius: '6px',
                                  border: idx === currentIndex ? '1px solid #38bdf8' : '1px solid #334155',
                                  backgroundColor: idx === currentIndex ? '#0369a1' : '#1e293b',
                                  color: idx === currentIndex ? '#ffffff' : '#94a3b8',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'monospace'
                                }}
                              >
                                {idx + 1}. {r.domain}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Recipient Metadata Card */}
                        <div style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '1rem',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '0.75rem',
                          fontSize: '0.85rem'
                        }}>
                          <div>
                            <div style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                              Website Domain
                            </div>
                            <div style={{ color: '#f8fafc', fontWeight: '600' }}>
                              {current.domain}
                            </div>
                          </div>

                          <div>
                            <div style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                              Recipient Email
                            </div>
                            <div style={{ color: current.email ? '#38bdf8' : '#f87171', fontWeight: '600', fontFamily: 'monospace' }}>
                              {current.email ? current.email : '⚠️ No domain-matched email found'}
                            </div>
                          </div>

                          <div>
                            <div style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                              Greeting Derivation
                            </div>
                            <div style={{ color: '#a7f3d0', fontWeight: '600' }}>
                              {current.greeting}
                            </div>
                          </div>
                        </div>

                        {/* Subject */}
                        <div style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '0.85rem 1rem',
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '0.75rem'
                        }}>
                          <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase', flexShrink: 0 }}>
                            Subject:
                          </span>
                          <span style={{ color: '#f8fafc', fontWeight: '600', fontSize: '0.95rem' }}>
                            {current.subject}
                          </span>
                        </div>

                        {/* Email Body Preview Box */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <label style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            Personalised Email Body Preview
                          </label>
                          <div style={{
                            backgroundColor: '#090d16',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '1.25rem',
                            color: '#f1f5f9',
                            fontSize: '0.92rem',
                            lineHeight: '1.65',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '340px',
                            overflowY: 'auto',
                            fontFamily: 'inherit'
                          }}>
                            {current.body}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Footer Actions */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginTop: '0.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #334155'
                    }}>
                      <button
                        onClick={() => setIsPreviewModalOpen(false)}
                        className="table-btn"
                        style={{ backgroundColor: '#334155', color: '#cbd5e1' }}
                      >
                        Close Preview
                      </button>

                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                          onClick={() => {
                            setIsPreviewModalOpen(false);
                            openTemplateModal();
                          }}
                          className="table-btn"
                          style={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#cbd5e1' }}
                        >
                          ✏️ Edit Template
                        </button>
                        <button
                          onClick={() => {
                            setIsPreviewModalOpen(false);
                            fetchSenderStatus();
                            setIsSendConfirmModalOpen(true);
                          }}
                          className="analyse-btn-green"
                          style={{
                            padding: '0.65rem 1.4rem',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          Proceed to Confirm Send &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modal: Confirm Outreach Send */}
            {isSendConfirmModalOpen && activePack && (() => {
              const selectedProspects = activePack.prospects?.filter(p => selectedProspectIdsInPack.has(p.id || p.domain)) || [];
              let totalRecipients = 0;
              selectedProspects.forEach(p => {
                const emails = Array.from(new Set([p.contactEmail, ...(p.allFoundEmails || [])].filter(Boolean)))
                  .filter(em => isDomainMatch(em, p.domain));
                totalRecipients += emails.length;
              });

              return (
                <div className="modal-overlay" style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 99999,
                  padding: '1.5rem'
                }}>
                  <div style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    width: '100%',
                    maxWidth: '600px',
                    padding: '2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.9)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.35rem' }}>
                          Confirm Outreach Send
                        </h3>
                        <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                          Review the details below before dispatching live outreach emails.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!isSendingPack) {
                            setIsSendConfirmModalOpen(false);
                            setSendErrorMsg(null);
                          }
                        }}
                        disabled={isSendingPack}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: isSendingPack ? 'not-allowed' : 'pointer' }}
                      >
                        &times;
                      </button>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '160px 1fr',
                      gap: '0.75rem 1rem',
                      backgroundColor: '#1e293b',
                      padding: '1.25rem',
                      borderRadius: '6px',
                      border: '1px solid #334155',
                      fontSize: '0.9rem'
                    }}>
                      <div style={{ color: '#94a3b8', fontWeight: 'bold' }}>Pack ID:</div>
                      <div style={{ color: '#38bdf8', fontWeight: 'bold' }}>{activePack.packId}</div>

                      <div style={{ color: '#94a3b8', fontWeight: 'bold' }}>Selected Prospects:</div>
                      <div style={{ color: '#ffffff' }}><strong>{selectedProspects.length}</strong></div>

                      <div style={{ color: '#94a3b8', fontWeight: 'bold' }}>Total Recipient Emails:</div>
                      <div style={{ color: '#ffffff' }}><strong>{totalRecipients}</strong> address{totalRecipients === 1 ? '' : 'es'}</div>

                      <div style={{ color: '#94a3b8', fontWeight: 'bold' }}>Subject Line:</div>
                      <div style={{ color: '#ffffff', wordBreak: 'break-word' }}>
                        {activePack.templateSubject || 'Partnership enquiry — The Search Equation'}
                      </div>

                      <div style={{ color: '#94a3b8', fontWeight: 'bold' }}>Sender Mailbox:</div>
                      <div>
                        {senderStatus.configured && senderStatus.senderMailbox ? (
                          <span style={{ color: '#10b981', fontWeight: 'bold' }}>{senderStatus.senderMailbox}</span>
                        ) : (
                          <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>Not Configured (SMTP credentials required)</span>
                        )}
                      </div>
                    </div>

                    {!senderStatus.configured ? (
                      <div style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: '6px',
                        padding: '1rem',
                        color: '#f59e0b',
                        fontSize: '0.85rem',
                        lineHeight: '1.5'
                      }}>
                        <strong>Outbound Email Provider Not Configured:</strong>
                        <p style={{ margin: '0.4rem 0 0 0' }}>
                          No SMTP or outbound email credentials are currently configured in the server environment. To enable live sending, configure <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, and <code>SMTP_FROM</code> on the server.
                        </p>
                      </div>
                    ) : (
                      <div style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '6px',
                        padding: '0.85rem 1rem',
                        color: '#cbd5e1',
                        fontSize: '0.85rem'
                      }}>
                        <div style={{ color: '#34d399', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                          ✓ Outbound SMTP Configured & Ready ({senderStatus.senderMailbox || 'mac@thesearchequation.co.uk'})
                        </div>
                        <div>
                          Live emails will be rendered individually per prospect and dispatched to all discovered contact addresses.
                        </div>
                      </div>
                    )}

                    {sendErrorMsg && (
                      <div style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem',
                        color: '#ef4444',
                        fontSize: '0.85rem'
                      }}>
                        ❌ {sendErrorMsg}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setIsSendConfirmModalOpen(false);
                          setSendErrorMsg(null);
                        }}
                        disabled={isSendingPack}
                        className="table-btn"
                        style={{ backgroundColor: '#334155', color: '#cbd5e1' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSendPack}
                        disabled={!senderStatus.configured || totalRecipients === 0 || isSendingPack}
                        className="analyse-btn-green"
                        style={{
                          padding: '0.6rem 1.4rem',
                          opacity: (!senderStatus.configured || totalRecipients === 0 || isSendingPack) ? 0.5 : 1,
                          cursor: (!senderStatus.configured || totalRecipients === 0 || isSendingPack) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isSendingPack ? 'Sending Live Emails...' : 'Confirm Send'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modal: Create / Edit Master Email Template */}
            {isTemplateEditorModalOpen && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '1.5rem'
              }}>
                <div style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  width: '100%',
                  maxWidth: '1180px',
                  maxHeight: '92vh',
                  overflowY: 'auto',
                  padding: '2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.9)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.35rem' }}>
                        {editingTemplate ? 'Edit Master Email Template' : 'Create Master Email Template'}
                      </h3>
                      <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                        Master templates are reusable across all Outreach Packs.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsTemplateEditorModalOpen(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
                    >
                      &times;
                    </button>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 0.95fr)',
                    gap: '1.75rem',
                    alignItems: 'start'
                  }}>
                    {/* LEFT: Existing Template Form */}
                    <form onSubmit={handleSaveTemplateSubmit} data-lpignore="true" data-form-type="other" autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>Template Name</label>
                        <input
                          type="text"
                          value={templateNameInput}
                          onChange={(e) => setTemplateNameInput(e.target.value)}
                          placeholder="e.g. Warm Partnership / Investment Approach"
                          className="search-input"
                          style={{ width: '100%', boxSizing: 'border-box' }}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>Template Classification</label>
                        <select
                          value={templateTypeInput}
                          onChange={(e) => setTemplateTypeInput(e.target.value)}
                          className="search-input"
                          style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#1e293b', color: '#ffffff', cursor: 'pointer' }}
                        >
                          <option value="organic">Google Organic SERP (Organic)</option>
                          <option value="local">Local Business Listings (GBP / Local)</option>
                          <option value="master">General / Master Template</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>Subject Line</label>
                        <input
                          type="text"
                          value={templateSubjectInput}
                          onChange={(e) => setTemplateSubjectInput(e.target.value)}
                          placeholder="Partnership enquiry: {{trade}} in {{location}} — {{company_name}}"
                          className="search-input"
                          style={{ width: '100%', boxSizing: 'border-box' }}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          required
                        />
                      </div>

                      {/* Helper Insert Tokens */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'bold' }}>
                          Click to insert personalisation variables:
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {['{{trade}}', '{{location}}', '{{domain}}', '{{businessName}}', '{{firstName}}', '{{sender_first_name}}', '{{sender_name}}', '{{company_name}}'].map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setTemplateBodyInput(prev => `${prev} ${tag} `);
                              }}
                              className="table-btn"
                              style={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #475569',
                                color: '#38bdf8',
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.8rem',
                                fontFamily: 'monospace',
                                cursor: 'pointer'
                              }}
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                          Email Body <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>(Salutation like "Hi Paul," or "Hi there," is automatically prepended upon sending)</span>
                        </label>
                        <textarea
                          value={templateBodyInput}
                          onChange={(e) => setTemplateBodyInput(e.target.value)}
                          placeholder="Write your email body here..."
                          className="analysis-notes-area"
                          style={{
                            height: '240px',
                            width: '100%',
                            boxSizing: 'border-box',
                            fontFamily: 'inherit',
                            fontSize: '0.925rem',
                            lineHeight: '1.5'
                          }}
                          required
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => setIsTemplateEditorModalOpen(false)}
                          className="table-btn"
                          style={{ backgroundColor: '#334155', color: '#cbd5e1', padding: '0.5rem 1.25rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="analyse-btn-green"
                          style={{ padding: '0.5rem 1.5rem', fontWeight: 'bold' }}
                        >
                          Save Master Template
                        </button>
                      </div>
                    </form>

                    {/* RIGHT: Personalisation Variables Reference Panel */}
                    <div style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      minWidth: 0
                    }}>
                      <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1.05rem', fontWeight: 600 }}>
                        Personalisation Variables
                      </h4>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '0.8125rem',
                          textAlign: 'left'
                        }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #475569' }}>
                              <th style={{ padding: '8px 8px', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem' }}>VARIABLE</th>
                              <th style={{ padding: '8px 8px', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem' }}>WHAT IT USES</th>
                              <th style={{ padding: '8px 8px', color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem' }}>EXAMPLE</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{trade}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Search trade/service</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Window Shutters</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{location}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Search location</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Portsmouth</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{domain}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Prospect website domain</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>example.co.uk</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{businessName}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Prospect business name</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Diamond Window Shutters</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{firstName}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Prospect/contact first name</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Paul</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{sender_first_name}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Settings → Sender First Name</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Mac</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.7)' }}>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{sender_name}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Settings → Sender Full Name</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>Mac McCarthy</td>
                            </tr>
                            <tr>
                              <td style={{ padding: '8px 8px', color: '#38bdf8', fontFamily: 'monospace', fontWeight: 600 }}>{'{{company_name}}'}</td>
                              <td style={{ padding: '8px 8px', color: '#cbd5e1' }}>Settings → Company Name</td>
                              <td style={{ padding: '8px 8px', color: '#94a3b8' }}>The Search Equation</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {currentView === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem' }}>
            <div className="search-header-container" style={{ marginBottom: 0 }}>
              <h1 className="header-title">Settings</h1>
              <p className="header-subtitle">Configure application settings and track project release history.</p>
            </div>

            {/* Outreach Sender Details Section */}
            <div className="results-table-container" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#ffffff', fontSize: '1.4rem' }}>Outreach Sender Details</h2>
                  <p style={{ margin: '0.35rem 0 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                    Configure sender identity and company values resolved in master outreach templates (<code style={{ color: '#38bdf8' }}>{"{{sender_first_name}}"}</code>, <code style={{ color: '#38bdf8' }}>{"{{sender_name}}"}</code>, and <code style={{ color: '#38bdf8' }}>{"{{company_name}}"}</code>).
                  </p>
                  {currentUser && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem', backgroundColor: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>Active Workspace:</span>
                      <strong style={{ color: '#38bdf8' }}>{currentUser.workspaceLabel || (currentUser.workspace === 'smoking_chili' ? 'Smoking Chili Media' : 'The Search Equation')}</strong>
                      <span style={{ color: '#64748b' }}>({currentUser.email || currentUser.username})</span>
                    </div>
                  )}
                </div>
                {senderSettingsSavedMsg && (
                  <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.9rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #10b981' }}>
                    ✓ Settings saved successfully
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveSenderSettings} data-lpignore="true" data-form-type="other" autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                      Sender First Name <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 'normal' }}>{"{{sender_first_name}}"}</span>
                    </label>
                    <input
                      type="text"
                      value={senderSettings.sender_first_name}
                      onChange={(e) => setSenderSettings(prev => ({ ...prev, sender_first_name: e.target.value }))}
                      placeholder="e.g. Mac"
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                      Sender Full Name <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 'normal' }}>{"{{sender_name}}"}</span>
                    </label>
                    <input
                      type="text"
                      value={senderSettings.sender_name}
                      onChange={(e) => setSenderSettings(prev => ({ ...prev, sender_name: e.target.value }))}
                      placeholder="e.g. Mac McCarthy"
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 'bold' }}>
                      Company Name <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontWeight: 'normal' }}>{"{{company_name}}"}</span>
                    </label>
                    <input
                      type="text"
                      value={senderSettings.company_name}
                      onChange={(e) => setSenderSettings(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="e.g. The Search Equation"
                      className="search-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                  <button
                    type="submit"
                    className="analyse-btn-green"
                    disabled={isSavingSenderSettings}
                    style={{ padding: '0.55rem 1.5rem', fontWeight: 'bold' }}
                  >
                    {isSavingSenderSettings ? 'Saving...' : 'Save Sender Details'}
                  </button>
                </div>
              </form>
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
                {isShortlisted(activeAnalysisItem.domain || activeAnalysisItem.url) ? (
                  <button 
                    onClick={() => handleRemoveFromOutreach(activeAnalysisItem.domain || activeAnalysisItem.url)}
                    className="table-btn"
                    style={{ backgroundColor: '#059669', color: '#ffffff', fontWeight: '600' }}
                    title="Click to remove from Outreach List"
                  >
                    ✓ Shortlisted
                  </button>
                ) : (
                  <button 
                    onClick={() => handleAddToOutreach(activeAnalysisItem)}
                    className="table-btn"
                    style={{ backgroundColor: '#2563eb', color: '#ffffff', fontWeight: '600' }}
                  >
                    + Add to Outreach List
                  </button>
                )}
                <button 
                  onClick={handleBackToResults} 
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

                {/* Commercial Lead Strength */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>Commercial Lead Strength</span>
                  <span style={{ fontSize: '1.25rem', color: '#f59e0b', fontWeight: 'bold', lineHeight: '1.2' }}>{activeAnalysisItem.leadPriority?.stars || '★★★☆☆'}</span>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.25rem' }}>{activeAnalysisItem.leadPriority?.label || 'Good Lead'}</span>
                </div>

                {/* Google Business Profile Status */}
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '6px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600', marginBottom: '0.5rem' }}>GBP Status</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: activeAnalysisItem.gbp?.status === 'Found' ? '#10b981' : (activeAnalysisItem.gbp?.status === 'Multiple Matches' ? '#f59e0b' : '#ef4444'), lineHeight: '1.2' }}>
                    {activeAnalysisItem.gbp?.status === 'Found' ? 'Found' : (activeAnalysisItem.gbp?.status === 'Multiple Matches' ? 'Multiple Matches' : 'No Profile Matched')}
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
                  {activeAnalysisItem.leadOpportunityScore?.score !== null && activeAnalysisItem.leadOpportunityScore?.score !== undefined ? (
                    <>
                      <span style={{ fontSize: '4.5rem', fontWeight: '800', color: activeAnalysisItem.leadOpportunityScore?.score >= 80 ? '#ef4444' : (activeAnalysisItem.leadOpportunityScore?.score >= 60 ? '#f59e0b' : (activeAnalysisItem.leadOpportunityScore?.score >= 30 ? '#3b82f6' : '#10b981')), lineHeight: '1' }}>
                        {activeAnalysisItem.leadOpportunityScore.score}
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
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '3.5rem', fontWeight: '800', color: '#94a3b8', lineHeight: '1' }}>
                        N/A
                      </span>
                      <span style={{ 
                        marginTop: '0.75rem',
                        fontWeight: 'bold', 
                        fontSize: '1.05rem',
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '20px', 
                        backgroundColor: 'rgba(148, 163, 184, 0.2)',
                        color: '#94a3b8'
                      }}>
                        N/A
                      </span>
                    </>
                  )}
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
                    {activeAnalysisItem.gbp?.status === 'Found' ? 'Found' : (activeAnalysisItem.gbp?.status === 'Multiple Matches' ? 'Multiple Matches' : 'No Profile Matched')}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Business Name</span>
                  <span className="analysis-value">{!activeAnalysisItem.gbp?.businessName || activeAnalysisItem.gbp?.businessName === 'Not Found' ? 'No Profile Matched' : activeAnalysisItem.gbp.businessName}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Primary Category</span>
                  <span className="analysis-value">{!activeAnalysisItem.gbp?.primaryCategory || activeAnalysisItem.gbp?.primaryCategory === 'Not Found' ? 'No Profile Matched' : activeAnalysisItem.gbp.primaryCategory}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Rating</span>
                  <span className="analysis-value" style={{ fontWeight: 'bold', color: activeAnalysisItem.gbp?.rating && activeAnalysisItem.gbp?.rating !== 'Not Found' ? '#f59e0b' : 'inherit' }}>
                    {activeAnalysisItem.gbp?.rating !== 'Not Found' && activeAnalysisItem.gbp?.rating !== undefined ? `★ ${activeAnalysisItem.gbp.rating}` : 'No Profile Matched'}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Review Count</span>
                  <span className="analysis-value">{!activeAnalysisItem.gbp?.reviewCount || activeAnalysisItem.gbp?.reviewCount === 'Not Found' ? 'No Profile Matched' : activeAnalysisItem.gbp.reviewCount}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Website URL</span>
                  <span className="analysis-value" style={{ wordBreak: 'break-all', maxWidth: '100%', display: 'inline-block' }}>
                    {activeAnalysisItem.gbp?.websiteUrl && activeAnalysisItem.gbp?.websiteUrl !== 'Not Found' && activeAnalysisItem.gbp?.websiteUrl !== 'Multiple Matches' ? (
                      <a href={activeAnalysisItem.gbp.websiteUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                        {activeAnalysisItem.gbp.websiteUrl}
                      </a>
                    ) : (activeAnalysisItem.gbp?.websiteUrl === 'Not Found' || !activeAnalysisItem.gbp?.websiteUrl ? 'No Profile Matched' : activeAnalysisItem.gbp.websiteUrl)}
                  </span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Phone Number</span>
                  <span className="analysis-value">{!activeAnalysisItem.gbp?.phoneNumber || activeAnalysisItem.gbp?.phoneNumber === 'Not Found' ? 'No Profile Matched' : activeAnalysisItem.gbp.phoneNumber}</span>
                </div>
                <div className="analysis-row">
                  <span className="analysis-label">Address</span>
                  <span className="analysis-value" style={{ textAlign: 'right' }}>{!activeAnalysisItem.gbp?.address || activeAnalysisItem.gbp?.address === 'Not Found' ? 'No Profile Matched' : activeAnalysisItem.gbp.address}</span>
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

              {/* Website Desktop Preview Card */}
              <div className="analysis-section" style={{ gridColumn: '1 / -1', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #334155', paddingBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>🖥️</span>
                    <h3 style={{ margin: 0, border: 'none', padding: 0, fontSize: '1.15rem', color: '#ffffff' }}>Website Desktop Preview</h3>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {activeAnalysisItem.url && (
                      <a 
                        href={activeAnalysisItem.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="table-btn"
                        style={{ backgroundColor: '#1e293b', border: '1px solid #334155', color: '#38bdf8', textDecoration: 'none', fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        <span>Open Live Site ↗</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Mock Browser Frame */}
                <div style={{
                  backgroundColor: '#0f172a',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}>
                  {/* Browser Header Bar */}
                  <div style={{
                    backgroundColor: '#1e293b',
                    padding: '0.5rem 0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    borderBottom: '1px solid #334155'
                  }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                    </div>
                    <div style={{
                      flex: 1,
                      backgroundColor: '#090d16',
                      borderRadius: '4px',
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      🔒 {activeAnalysisItem.url || (`https://${activeAnalysisItem.domain}`)}
                    </div>
                  </div>

                  {/* Screenshot Image Container */}
                  <div style={{
                    minHeight: '280px',
                    maxHeight: '520px',
                    overflowY: 'auto',
                    backgroundColor: '#090d16',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    position: 'relative'
                  }}>
                    <img
                      src={`${API_BASE}/api/screenshot?url=${encodeURIComponent(activeAnalysisItem.url || ('https://' + activeAnalysisItem.domain))}`}
                      alt={`Website Preview for ${activeAnalysisItem.domain}`}
                      style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.nextSibling) {
                          e.currentTarget.nextSibling.style.display = 'flex';
                        }
                      }}
                    />
                    <div style={{
                      display: 'none',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '3rem 1.5rem',
                      color: '#94a3b8',
                      textAlign: 'center',
                      gap: '0.5rem',
                      width: '100%'
                    }}>
                      <span style={{ fontSize: '2.5rem' }}>🌐</span>
                      <span style={{ fontWeight: 'bold', color: '#cbd5e1' }}>Desktop Preview Unavailable</span>
                      <span style={{ fontSize: '0.85rem' }}>Direct connection or security restrictions prevented live screenshot capture.</span>
                      {activeAnalysisItem.url && (
                        <a href={activeAnalysisItem.url} target="_blank" rel="noopener noreferrer" className="table-btn" style={{ marginTop: '0.75rem', backgroundColor: '#2563eb', color: '#ffffff' }}>
                          Visit {activeAnalysisItem.domain} ↗
                        </a>
                      )}
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
    </>
  )
}

export default App
