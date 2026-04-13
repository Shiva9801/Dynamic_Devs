const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Load environment variables from .env file
require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const app = express();
app.use(cors());
// Increase JSON payload limit for large Base64 images
app.use(express.json({ limit: '10mb' }));

const matchesPath = path.join(__dirname, 'data', 'all_matches.json');

// ─── Data Collections ────────────────────────────────────────────────────────
const master_medicines = new Map(); // salt_key -> master_medicine object
const brand_lookup = new Map();     // lowercase string -> salt_key

// Helper to extract basic strength/form (naive regex guesser)
function guessStrengthForm(str) {
    const strengthMatch = str.match(/\d+(\.\d+)?(mg|g|ml|mcg|%)/i);
    const strength = strengthMatch ? strengthMatch[0] : 'Standard';

    let form = 'Tablet/Capsule';
    if (/syrup|suspension/i.test(str)) form = 'Syrup';
    else if (/injection/i.test(str)) form = 'Injection';
    else if (/cream|gel|ointment/i.test(str)) form = 'Topical';
    else if (/drops/i.test(str)) form = 'Drops';

    return { strength, form };
}

// ─── Initialize Database ──────────────────────────────────────────────────────
try {
    const rawData = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
    let idCounter = 1;

    rawData.forEach(entry => {
        const saltKey = `salt-${idCounter++}`;
        const { strength, form } = guessStrengthForm(entry.genericName);

        // Build Master Medicine Object
        const masterData = {
            salt_key: saltKey,
            salt_name: entry.genericName,
            strength: strength,
            form: form,
            therapeutic_class: "General Therapeutics", // Defaulting as dataset lacks this
            compositions: [entry.genericName], // Raw string as composition
            brands: []
        };

        // 1. Add the Jan Aushadhi generic into the brands array
        masterData.brands.push({
            brand_id: `gen-${idCounter}`,
            brand_name: "Jan Aushadhi Generic",
            price: parseFloat(entry.genericPrice) || 0,
            manufacturer: "PMBJP",
            is_generic: true,
            price_per_unit: (parseFloat(entry.genericPrice) || 0) / 10, // Mock unit calculation
            regulatory_status: "PMBI Approved",
            strength: strength,
            form: form
        });

        // Register generic name in lookup pointing to this salt
        brand_lookup.set(entry.genericName.toLowerCase(), saltKey);

        // 2. Add each branded match into the brands array
        (entry.brandedMatches || []).forEach(br => {
            const brPrice = parseFloat(br.price) || 0;
            const brDetails = guessStrengthForm(br.name);
            masterData.brands.push({
                brand_id: `br-${idCounter++}`,
                brand_name: br.name,
                price: brPrice,
                manufacturer: "Branded Manufacturer", // Unknown in our stripped dataset
                is_generic: false,
                price_per_unit: brPrice / 10, // Mock unit calculation
                regulatory_status: "CDSCO Verified",
                strength: brDetails.strength,
                form: brDetails.form
            });
            // Register brand name in lookup
            brand_lookup.set(br.name.toLowerCase(), saltKey);
        });

        // Store the completed salt object
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

        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error("OPENROUTER_API_KEY is not defined in environment variables");
        }

        console.log("Analyzing with OpenRouter Gemma Vision...");

        // Construct the base64 URL format
        const imageUrl = `data:${mimeType};base64,${base64Image}`;

        const promptText = `Extract the medicine or drug names written on this prescription. 
Return ONLY a JSON array of strings containing the identified medicine names.
If you cannot read any medicine names clearly, return an empty array [].
Example output: ["Amoxicillin", "Paracetamol"]
Do not return any markdown formatting around the output, only valid JSON.`;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemma-3-27b-it", // Gemma 3 vision-capable model
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": promptText
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": imageUrl
                                }
                            }
                        ]
                    }
                ],
                "temperature": 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        let resultText = data.choices[0].message.content.trim();

        console.log("✅ OpenRouter Success (Raw):", resultText);

        // Clean any potential markdown blocks the model may have ignored
        resultText = resultText.replace(/```json/gi, '').replace(/```/g, '').trim();

        let medicinesList = [];
        try {
            medicinesList = JSON.parse(resultText);
            if (!Array.isArray(medicinesList)) throw new Error("Parsed result is not an array");
        } catch (e) {
            console.warn("⚠️ Failed to parse valid JSON array from model output. Attempting to extract words manually.");
            // Fallback word extraction if model messes up the format
            medicinesList = resultText
                .split(/[\s,\n]+/)
                .map(word => word.replace(/[^a-zA-Z]/g, '').trim())
                .filter(word => word.length >= 4);
        }

        // Deduplicate
        medicinesList = [...new Set(medicinesList)];
        console.log("Extracted Medicines:", medicinesList);

        const ocrResultPath = path.join(__dirname, 'data', 'latest_ocr_result.json');
        await fs.promises.writeFile(ocrResultPath, JSON.stringify({ result: medicinesList }, null, 2));
        console.log("📁 Saved OCR output to JSON file: " + ocrResultPath);

        // Bust the require() cache so /api/ocr/latest always serves the freshly written file
        delete require.cache[require.resolve('./data/latest_ocr_result.json')];

        res.json({ file: 'latest_ocr_result.json', status: 'saved' });

    } catch (err) {
        console.error("💥 OCR API Crash:", err.message);
        res.status(500).json({
            error: "OCR Analysis Failed",
            details: err.message
        });
    }
});

// ─── Backend Endpoint to Fetch Saved OCR JSON via require() ─────────────────
app.get('/api/ocr/latest', (req, res) => {
    try {
        console.log("Fetching latest OCR JSON via require()...");
        const ocrResultPath = path.join(__dirname, 'data', 'latest_ocr_result.json');

        if (!fs.existsSync(ocrResultPath)) {
            return res.status(404).json({ error: "No OCR scan data found yet. Please scan a prescription first." });
        }

        // Clear require cache to always get the freshest version of the file
        delete require.cache[require.resolve('./data/latest_ocr_result.json')];

        // Load the JSON file using require()
        const ocrData = require('./data/latest_ocr_result.json');

        console.log("✅ Loaded OCR JSON via require():", ocrData);
        res.json(ocrData);
    } catch (err) {
        console.error("Error loading JSON via require():", err.message);
        res.status(500).json({ error: "Failed to load OCR JSON", details: err.message });
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

        const fallbackData = {
            "used_for": "Information not available due to high server load. Often used to treat specific conditions associated with this salt.",
            "benefits": "Provides relief from symptoms and aids in recovery. Please consult your doctor for exact medical benefits.",
            "side_effects": "May cause common side effects such as nausea, dizziness, or allergic reactions. Seek medical advice if severe.",
            "how_to_use": "Take exactly as directed by your physician. Do not exceed the recommended prescribed dose.",
            "dosage": {
                "kids": "Consult a pediatrician for precise dosing.",
                "adults": "Strictly as prescribed by your doctor.",
                "elderly": "As prescribed. May require dosage adjustments."
            },
            "substitutes": "Alternative generic equivalents may be available at local pharmacies."
        };

        let responseData;
        try {
            const result = await model.generateContent(prompt);
            let rawText = result.response.text();

            // Strip out markdown code blocks if the AI decided to include them anyway
            rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            responseData = JSON.parse(rawText);
        } catch (apiErr) {
            console.error("⚠️ Gemini API Rate Limit / Error, using fallback data:", apiErr.message);
            responseData = fallbackData;
        }

        res.json(responseData);
    } catch (err) {
        console.error("💥 Details Endpoint Error:", err.message);
        res.status(500).json({ error: "Failed to fetch medical details", description: err.message });
    }
});

// ─── Backend Proxy for Overpass API (Avoids CORS / Browser Blocks) ────────────
app.get('/api/pharmacies/nearby', async (req, res) => {
    const { lat, lon, radius } = req.query;
    if (!lat || !lon || !radius) return res.status(400).json({ error: "Missing coordinates or radius" });

    const query = `[out:json];node["amenity"="pharmacy"](around:${radius},${lat},${lon});out;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(overpassUrl);
        if (!response.ok) throw new Error("Overpass API returned status " + response.status);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error("💥 Overpass API Proxy Error:", err.message);
        res.status(500).json({ error: "Failed to load pharmacies", details: err.message });
    }
});


const PORT = process.env.PORT || 4000;

// ─── Backend Endpoints for Stores ──────────────────────────────────────────────
app.get('/api/stores/jan-aushadhi', (req, res) => {
    try {
        const storePath = path.join(__dirname, 'data', 'jan_aushadhi_kendras.json');
        if (!fs.existsSync(storePath)) {
            return res.status(404).json({ error: "Jan Aushadhi store data not found" });
        }
        const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        res.json(storeData);
    } catch (err) {
        console.error("Error loading stores:", err.message);
        res.status(500).json({ error: "Failed to load stores", details: err.message });
    }
});


// ─── Backend AI Doctor Chat Endpoint (Groq-Powered) ──────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: "No message provided" });
        }

        if (!GROQ_API_KEY) {
            return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
        }

        console.log(`\n💬 AI Doctor Chat Request: "${message}"`);

        const promptText = `You are Dr. MedFind, a sympathetic and highly knowledgeable AI Doctor.
A patient will say: "${message}"

First, determine if the statement is related to a medical problem, health issue, symptom, or general health inquiry.
If it is NOT related to the medical field, you MUST reply exactly with: "Sorry, I don't have data for your particular problem." and nothing else.

If it IS a medical problem, listen carefully, provide a brief sympathetic response, and then suggest exactly 2 or 3 common generic medicine salts (e.g., Paracetamol, Cetirizine) that treat the problem. Format the response so that the medicine recommendations are clear. Keep your response concise (under 4 sentences).`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {
                        "role": "system",
                        "content": promptText
                    }
                ],
                "temperature": 0.3
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content.trim();
        
        console.log("✅ AI Doctor Reply generated");
        res.json({ reply });

    } catch (err) {
        console.error("💥 AI Chat Error:", err.message);
        res.status(500).json({ error: "Failed to generate response", details: err.message });
    }
});

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
