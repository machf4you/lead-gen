const benchmarks = [
  {
    name: "Irwin Mitchell (London)",
    url: "https://www.irwinmitchell.com",
    searchPhrase: "Solicitors London",
    location: "London",
    expected: {
      status: "Found",
      businessName: "Irwin Mitchell Solicitors",
      primaryCategory: ["Law firm", "Lawyer", "Solicitor"],
      websiteUrlStartsWith: "https://www.irwinmitchell.com/our-offices/london"
    }
  },
  {
    name: "Penylan Plumbing & Heating (Bristol)",
    url: "https://penylanplumbingandheatingbristol.co.uk/",
    searchPhrase: "Plumbers Bristol",
    location: "Bristol",
    expected: {
      status: "Found",
      businessName: "Penylan Plumbing & Heating",
      primaryCategory: ["Plumber", "Plumbing"],
      websiteUrlStartsWith: "https://penylanplumbingandheatingbristol.co.uk/"
    }
  },
  {
    name: "Cotswold Shutter Co Ltd (Cheltenham)",
    url: "https://www.cotswoldshutterco.co.uk/window-shutters/cheltenham-shutter-questions/",
    searchPhrase: "window shutters Cheltenham",
    location: "Cheltenham",
    expected: {
      status: "Found",
      businessName: "Cotswold Shutter Co Ltd",
      primaryCategory: ["Blinds shop", "Window treatment store", "Shutter shop"],
      websiteUrlStartsWith: "https://www.cotswoldshutterco.co.uk"
    }
  }
];

async function runSuite() {
  console.log("=== Running Google Business Profile Matching Regression Suite ===\n");
  let passedCount = 0;
  let failedCount = 0;

  for (const tc of benchmarks) {
    console.log(`[TEST] ${tc.name}...`);
    try {
      const response = await fetch('http://localhost:5000/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: tc.url,
          searchType: 'Organic',
          rank: 1,
          location: tc.location
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const gbp = data.gbp;

      if (!gbp) {
        throw new Error("No 'gbp' field returned in analysis response");
      }

      const errors = [];
      if (gbp.status !== tc.expected.status) {
        errors.push(`Status mismatch: Expected "${tc.expected.status}", Got "${gbp.status}"`);
      }
      if (gbp.businessName !== tc.expected.businessName) {
        errors.push(`Business Name mismatch: Expected "${tc.expected.businessName}", Got "${gbp.businessName}"`);
      }
      const allowedCategories = Array.isArray(tc.expected.primaryCategory) ? tc.expected.primaryCategory : [tc.expected.primaryCategory];
      if (!allowedCategories.some(cat => (gbp.primaryCategory || '').toLowerCase().includes(cat.toLowerCase()))) {
        errors.push(`Category mismatch: Expected one of ${JSON.stringify(allowedCategories)}, Got "${gbp.primaryCategory}"`);
      }
      if (tc.expected.websiteUrlStartsWith && !(gbp.websiteUrl || '').startsWith(tc.expected.websiteUrlStartsWith)) {
        errors.push(`Website URL mismatch: Expected URL starting with "${tc.expected.websiteUrlStartsWith}", Got "${gbp.websiteUrl}"`);
      }

      if (errors.length === 0) {
        console.log(`  ✓ PASS! Status: ${gbp.status}, Name: ${gbp.businessName}, Category: ${gbp.primaryCategory}, Website: ${gbp.websiteUrl}\n`);
        passedCount++;
      } else {
        console.error(`  ✗ FAIL:\n    ${errors.join('\n    ')}\n`);
        failedCount++;
      }
    } catch (err) {
      console.error(`  ✗ ERROR during execution: ${err.message}\n`);
      failedCount++;
    }
  }

  console.log("=== Test Summary ===");
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  process.exitCode = failedCount > 0 ? 1 : 0;
}

runSuite();
