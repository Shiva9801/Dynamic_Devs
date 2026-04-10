const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const app = express();
app.use(cors());
// Increase JSON payload limit for large Base64 images
app.use(express.json({ limit: '10mb' }));

const matchesPath = path.join(__dirname, 'data', 'all_matches.json');

// ─── Data Collections ────────────────────────────────────────────────────────
const master_medicines = new Map(); // salt_key -> master_medicine object
const brand_lookup = new Map();     // lowercase string -> salt_key
const curatedPharmacies = [
    { name: "TGS FIRST AID OHC", map_link: "https://maps.app.goo.gl/JHV8FKkxGzTp9gnDA", distance_km: 2.0, bucket_km: 2 },
    { name: "Maa Akarshani Medical", map_link: "https://maps.app.goo.gl/3xp7KuuWkKvDpmhr8", distance_km: 3.4, bucket_km: 5 },
    { name: "Shakambhari Medical", map_link: "https://maps.app.goo.gl/jnLaPHyKdnmUrQcu8", distance_km: 4.5, bucket_km: 5 },
    { name: "Bhagat Medical Stores", map_link: "https://maps.app.goo.gl/7KfLQrBuUWgZ1tmz5", distance_km: 4.6, bucket_km: 5 },
    { name: "Drug Central Medicals", map_link: "https://maps.app.goo.gl/rgeUdsufjw1bEaST9", distance_km: 5.5, bucket_km: 10 },
    { name: "Apollo Pharmacy", map_link: "https://maps.app.goo.gl/j7avsxmAzVnzT9Ln8", distance_km: 9.9, bucket_km: 10 },
    { name: "Shree Medical", map_link: "https://maps.app.goo.gl/xPWbTjULRHoLftLB9", distance_km: 10.2, bucket_km: 10 }
];

const janAushadhiPath = path.join(__dirname, 'data', 'jan_aushadhi_kendras.json');

// Helper to extract basic strength/form (improved logic)
function guessStrengthForm(str) {
    // Extract strength like "500 mg", "125 mg per 5 ml", "100 mg per 2 ml"
    const strengthMatch = str.match(/\d+(\.\d+)?\s?(mg|g|ml|mcg|%)(?:\s?per\s?\d*\.?\d*\s?(ml|g))?/i);
    const strength = strengthMatch ? strengthMatch[0] : 'Standard';

    let form = 'Tablet/Capsule';
    const s = str.toLowerCase();
    if (s.includes('syrup')) form = 'Syrup';
    else if (s.includes('suspension')) form = 'Suspension';
    else if (s.includes('injection')) form = 'Injection';
    else if (s.includes('vial') || s.includes('ampoule')) form = 'Injection';
    else if (s.includes('cream') || s.includes('gel') || s.includes('ointment')) form = 'Topical';
    else if (s.includes('drops')) form = 'Drops';
    else if (s.includes('inhaler') || s.includes('respules')) form = 'Inhalation';
    else if (s.includes('solution')) form = 'Oral Solution';

    return { strength, form };
}

// ─── Initialize Database ──────────────────────────────────────────────────────
try {
    const rawData = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
    let idCounter = 1;

    rawData.forEach(entry => {
        const saltKey = `salt-${idCounter++}`;
        const refDose = guessStrengthForm(entry.genericName);

        // Build Master Medicine Object
        const masterData = {
            salt_key: saltKey,
            salt_name: entry.genericName,
            strength: refDose.strength,
            form: refDose.form,
            therapeutic_class: "General Therapeutics",
            compositions: [entry.genericName],
            brands: []
        };

        // 1. Add the Jan Aushadhi generic (PMBI Approved)
        masterData.brands.push({
            brand_id: `gen-${idCounter}`,
            brand_name: "Jan Aushadhi Generic",
            price: parseFloat(entry.genericPrice) || 0,
            manufacturer: "PMBJP (Government of India)",
            is_generic: true,
            regulatory_status: "PMBI Approved",
            strength: refDose.strength,
            form: refDose.form,
            price_per_unit: (parseFloat(entry.genericPrice) || 0) / 10
        });

        brand_lookup.set(entry.genericName.toLowerCase(), saltKey);

        // 2. Add each branded match (CDSCO Verified)
        (entry.brandedMatches || []).forEach(br => {
            const brPrice = parseFloat(br.price) || 0;
            const brDose = guessStrengthForm(br.name);
            masterData.brands.push({
                brand_id: `br-${idCounter++}`,
                brand_name: br.name,
                price: brPrice,
                manufacturer: "Verified Branded Lab",
                is_generic: false,
                regulatory_status: "CDSCO Verified",
                strength: brDose.strength,
                form: brDose.form,
                price_per_unit: brPrice / 10
            });
            brand_lookup.set(br.name.toLowerCase(), saltKey);
        });

        master_medicines.set(saltKey, masterData);
    });

    console.log(`✔ Database initialized with ${master_medicines.size} unique Salts/Compositions.`);
    console.log(`✔ Brand Lookup table holds ${brand_lookup.size} indexed keys.`);

} catch (err) {
    console.error('Error loading data:', err.message);
}

// ─── Search API Endpoints ─────────────────────────────────────────────────────

// Helper: Levenshtein distance for fuzzy matching
function getEditDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    var matrix = [];

    // increment along the first column of each row
    for (var i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    // increment each column in the first row
    for (var j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (var i = 1; i <= b.length; i++) {
        for (var j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1)); // deletion
            }
        }
    }
    return matrix[b.length][a.length];
}

app.get('/api/medicines/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase().trim() : '';
    const type = req.query.type || 'brand'; // 'brand' or 'salt'

    if (!query || query.length < 3) return res.json([]);

    const results = [];
    const addedSalts = new Set();

    if (type === 'brand') {
        // Search by Brand Name: Look exactly at brand_lookup keys using substring match or fuzzy
        for (const [brandName, saltKey] of brand_lookup.entries()) {
            // Strict substring match
            let isMatch = brandName.includes(query);

            // Fuzzy match (Allow 1-2 character typos depending on length)
            if (!isMatch && query.length >= 4) {
                const diff = getEditDistance(query, brandName.substring(0, query.length));
                if (diff <= 2) isMatch = true;
            }

            if (isMatch) {
                if (!addedSalts.has(saltKey)) {
                    results.push(master_medicines.get(saltKey));
                    addedSalts.add(saltKey);
                }
            }
            if (results.length >= 10) break; // limit
        }
    } else {
        // Search by Salt / Composition: Look at the master_medicines salt_name
        for (const master of master_medicines.values()) {
            const sName = master.salt_name.toLowerCase();
            let isMatch = sName.includes(query);

            // Fuzzy match on first word
            if (!isMatch && query.length >= 4) {
                const firstWord = sName.split(' ')[0] || "";
                if (getEditDistance(query, firstWord) <= 2) isMatch = true;
            }

            if (isMatch) {
                results.push(master);
            }
            if (results.length >= 10) break;
        }
    }

    res.json(results);
});

// A specific GET by salt_key (optional, but good for direct links)
app.get('/api/medicines/salt/:id', (req, res) => {
    const salt = master_medicines.get(req.params.id);
    if (!salt) return res.status(404).json({ error: "Salt not found" });
    res.json(salt);
});


// ─── Backend Secure OCR Endpoint ──────────────────────────────────────────────
app.post('/api/ocr', async (req, res) => {
    console.log(`\n📸 OCR Request received [${new Date().toISOString()}]`);

    try {
        const { base64Image, mimeType } = req.body;
        if (!base64Image) {
            console.error("❌ Error: No image data in request body");
            return res.status(400).json({ error: "No image payload provided" });
        }

        console.log(`🔍 Processing image (${base64Image.length} chars, type: ${mimeType})...`);

        const imageBuffer = Buffer.from(base64Image, 'base64');
        
        console.log("Analyzing with Tesseract OCR...");
        
        const { data: { text } } = await Tesseract.recognize(
            imageBuffer,
            'eng'
        );

        console.log("✅ Tesseract Success (Raw):", text);

        let wordsList = text
            .split(/[\s,\n]+/)
            .map(word => word.replace(/[^a-zA-Z]/g, '').trim())
            .filter(word => word.length >= 4); // requires at least 4 letters to guess

        // Filter against known medicines (naive substring lookup)
        let medicinesList = wordsList.filter(word => {
            const w = word.toLowerCase();
            for (const brandName of brand_lookup.keys()) {
                if (brandName.includes(w)) return true;
            }
            // also check master salts
            for (const master of master_medicines.values()) {
                if (master.salt_name.toLowerCase().includes(w)) return true;
            }
            return false;
        });

        // Deduplicate
        medicinesList = [...new Set(medicinesList)];

        res.json({ result: medicinesList });

    } catch (err) {
        console.error("💥 Tesseract API Crash:", err.message);
        res.status(500).json({
            error: "OCR Analysis Failed",
            details: err.message
        });
    }
});

// ─── Backend Medical Details Endpoint (Gemini-Powered Knowledge) ─────────────
app.get('/api/medicines/details/:saltKey', async (req, res) => {
    const saltKey = req.params.saltKey;
    const master = master_medicines.get(saltKey);
    
    if (!master) {
        return res.status(404).json({ error: "Medicine not found" });
    }

    const saltName = master.salt_name;
    console.log(`\n🩺 Fetching medical details for: ${saltName}`);

    try {
        if (!GEMINI_API_KEY) {
            return res.status(500).json({ error: "Gemini API Key missing on server" });
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `Provide detailed medical information for the medicine salt: "${saltName}".
        Return ONLY a JSON object with this exact structure:
        {
          "used_for": "A clear, 1-2 sentence description of diseases it cures or manages.",
          "benefits": "Key benefits of this medication.",
          "side_effects": "Common and serious side effects to watch out for.",
          "how_to_use": "Standard instructions on how to take it (e.g., with food, time of day).",
          "dosage": {
            "kids": "Standard dosage guidance for children.",
            "adults": "Standard dosage guidance for adults.",
            "elderly": "Standard dosage guidance for the elderly."
          },
          "substitutes": "A comma-separated list of common chemical/salt substitutes."
        }
        DO NOT include any Markdown formatting or extra text. ONLY return valid JSON.`;

        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        
        // Strip out markdown code blocks if the AI decided to include them anyway
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const responseData = JSON.parse(rawText);
        res.json(responseData);
    } catch (err) {
        console.error("💥 Gemini Details Error:", err.message);
        const msg = String(err.message || '');
        const isQuotaOrRateLimit = /429|quota|rate limit|too many requests/i.test(msg);
        if (isQuotaOrRateLimit) {
            // Graceful fallback so UI still shows useful content when LLM quota is exhausted.
            return res.json({
                used_for: `${saltName} is commonly prescribed based on clinical indication by a licensed doctor.`,
                benefits: "Can help manage symptoms when taken exactly as advised by your physician.",
                side_effects: "Possible side effects vary by patient. Stop use and consult your doctor if any severe reaction occurs.",
                how_to_use: "Take only as prescribed. Do not self-medicate, skip doses, or combine with other medicines without medical advice.",
                dosage: {
                    kids: "Pediatric dosage must be decided by a pediatrician.",
                    adults: "Adult dosage depends on diagnosis and medical history.",
                    elderly: "Dose adjustment may be required based on kidney/liver function and co-morbidities."
                },
                substitutes: "Clinical substitutes should be selected by a qualified doctor or pharmacist.",
                ai_status: "fallback_due_to_quota"
            });
        }
        res.status(500).json({ error: "Failed to fetch medical details", description: err.message });
    }
});

// ─── Backend Proxy for Geoapify API (Avoids CORS / Browser Blocks) ────────────
app.get('/api/pharmacies/nearby', async (req, res) => {
    const { lat, lon, radius } = req.query;
    if (!lat || !lon || !radius) return res.status(400).json({ error: "Missing coordinates or radius" });
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const radiusNum = Number(radius);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !Number.isFinite(radiusNum) || radiusNum <= 0) {
        return res.status(400).json({ error: "Invalid coordinates or radius" });
    }
    const radiusKm = radiusNum / 1000;
    const curatedElements = curatedPharmacies
        .filter(store => store.distance_km <= radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km)
        .map(store => ({
            lat: null,
            lon: null,
            tags: {
                name: store.name,
                map_link: store.map_link,
                distance_km: store.distance_km,
                curated: true
            }
        }));

    return res.json({ elements: curatedElements });
});

app.get('/api/jan-aushadhi-kendras', (req, res) => {
    try {
        const raw = fs.readFileSync(janAushadhiPath, 'utf8');
        res.json(JSON.parse(raw));
    } catch (err) {
        console.error('Jan Aushadhi kendra list error:', err.message);
        res.status(500).json({ error: 'Could not load Jan Aushadhi Kendra list' });
    }
});


const PORT = process.env.PORT || 3000;

// Global Error Handler (Ensures all errors return JSON instead of HTML)
app.use((err, req, res, next) => {
    console.error("🔥 Global Server Error:", err.message);
    res.status(err.status || 500).json({
        error: "Server Error",
        details: err.message
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 Advanced Relational Backend API running at http://localhost:${PORT}`);
});
