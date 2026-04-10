const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Load physical datasets
const medicinesDataPath = path.join(__dirname, 'data', 'medicines.json');
let medicines = [];

try {
    // 1. Load the Jan Aushadhi generic dataset
    const rawData = fs.readFileSync(medicinesDataPath);
    const parsedData = JSON.parse(rawData);
    
    // 2. Map dataset to the schema our frontend expects
    medicines = parsedData.map(item => ({
        id: item["Drug Code"] ? String(item["Drug Code"]) : String(item["Sr No"]),
        brandName: item["Generic Name"] || "Generic Medicine",
        activeIngredient: item["Generic Name"] || "Unknown Ingredient",
        dosageForm: item["Unit Size"] || "Standard",
        manufacturer: "PMBJP",
        price: parseFloat(item["MRP"]) || 0.0,
        isGeneric: true,
        therapeuticUse: item["Group Name"] || "General"
    }));
    
    console.log(`Successfully loaded & mapped ${medicines.length} authentic Jan Aushadhi records.`);
} catch (error) {
    console.error('Error loading medicines data:', error);
}

// Search for medicines by name, ingredient, or therapeutic use
app.get('/api/medicines/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    
    if (!query) {
        return res.json([]);
    }

    const terms = query.split(' ').filter(t => t.length > 2);

    const results = medicines.filter(med => {
        const textToSearch = `${med.activeIngredient} ${med.therapeuticUse} ${med.brandName}`.toLowerCase();
        
        // Match exact phrase first, or match any significant keywords
        if (textToSearch.includes(query)) return true;
        
        return terms.length > 0 && terms.some(term => textToSearch.includes(term));
    });

    // Return the top 30 results to prevent massive JSON payloads from freezing the frontend
    res.json(results.slice(0, 30));
});

// Get generic alternatives for a specific medicine
app.get('/api/medicines/:id/alternatives', (req, res) => {
    const id = req.params.id;
    const medicine = medicines.find(m => m.id === id);

    if (!medicine) {
        return res.status(404).json({ error: 'Medicine not found' });
    }

    // Since our database currently ONLY contains Jan Aushadhi generics,
    // we define alternatives as other dosages/variants of the exact same active ingredient.
    const alternatives = medicines.filter(m => 
        m.activeIngredient === medicine.activeIngredient && 
        m.id !== id
    );

    res.json(alternatives.slice(0, 10)); // Top 10 alternatives max
});

// Mock nearby pharmacies
app.get('/api/pharmacies', (req, res) => {
    // Generate some mock pharmacies
    const dummyPharmacies = [
        { name: "Pradhan Mantri Bhartiya Janaushadhi Kendra", distance: "0.8 km", status: "Stock Available", isJanAushadhi: true },
        { name: "City Health Pharmacy", distance: "1.2 km", status: "Stock Available", isJanAushadhi: false },
        { name: "Apollo Pharmacy", distance: "2.5 km", status: "Limited Stock", isJanAushadhi: false }
    ];

    res.json(dummyPharmacies);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
