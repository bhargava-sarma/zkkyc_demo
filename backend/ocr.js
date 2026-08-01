const Tesseract = require('tesseract.js');

async function extractAadhaarData(imageBuffer) {
  console.log('[OCR] Starting Tesseract recognition...');
  const startTime = Date.now();

  const {
    data: { text },
  } = await Tesseract.recognize(imageBuffer, 'eng');

  const duration = Date.now() - startTime;
  console.log(`[OCR] Recognition complete in ${duration}ms`);
  console.log(`[OCR] Raw text preview: "${text.substring(0, 50).replace(/\n/g, ' ')}..."`);

  const result = {
    rawText: text,
    name: null,
    dob: null,
    aadhaarNumber: null,
    gender: null,
  };

  // Extract DOB using pattern DOB: DD/MM/YYYY or DOB : DD/MM/YYYY
  const dobMatch = text.match(/DOB\s*[:\-]\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!dobMatch) {
    // Try alternate date patterns
    const altDobMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (altDobMatch) {
      result.dob = altDobMatch[1];
    }
  } else {
    result.dob = dobMatch[1];
  }

  // Extract Aadhaar number — 12 digits in groups of 4 separated by spaces
  const aadhaarMatch = text.match(/(\d{4}\s\d{4}\s\d{4})/);
  if (aadhaarMatch) {
    result.aadhaarNumber = aadhaarMatch[1];
  }

  // Extract gender — look for Male/Female/MALE/FEMALE/Transgender
  const genderMatch = text.match(/\b(Male|Female|MALE|FEMALE|Transgender|TRANSGENDER|Other|OTHER)\b/i);
  if (genderMatch) {
    const raw = genderMatch[1].toLowerCase();
    if (raw === 'male') result.gender = 'Male';
    else if (raw === 'female') result.gender = 'Female';
    else result.gender = 'Other';
  }
  console.log(`[OCR] Gender detected: ${result.gender || 'not found'}`);

  // Extract name — line before DOB line
  if (result.dob) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(result.dob) || lines[i].match(/DOB/i)) {
        // Name is the line immediately before the DOB line
        if (i > 0) {
          // Clean the name - remove any non-alpha characters except spaces
          let nameCandidate = lines[i - 1].replace(/[^a-zA-Z\s]/g, '').trim();
          if (nameCandidate.length > 1) {
            result.name = nameCandidate;
          }
        }
        break;
      }
    }
  }

  // Validate that we extracted required fields
  const missing = [];
  if (!result.name) missing.push('Name');
  if (!result.dob) missing.push('DOB');
  if (!result.aadhaarNumber) missing.push('Aadhaar number');

  if (missing.length > 0) {
    console.log(`[OCR] Extraction failed — missing: ${missing.join(', ')}`);
    throw new Error(
      `Could not extract required fields: ${missing.join(', ')}. Please use a clear, well-lit image.`
    );
  }

  // Gender is optional — warn but don't fail
  if (!result.gender) {
    console.log('[OCR] Warning: Gender not detected in OCR text, defaulting to null');
  }

  // Log extracted fields with masking
  console.log(`[OCR] Extracted — Name: ${result.name}, DOB: **/**/****, Gender: ${result.gender || 'N/A'}, Aadhaar: ****-****-${result.aadhaarNumber.slice(-4)}`);

  return result;
}

module.exports = { extractAadhaarData };
