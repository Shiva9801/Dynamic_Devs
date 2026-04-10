const API_BASE_URL = 'http://localhost:3000/api';

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const alternativesModal = document.getElementById('alternativesModal');
const closeModalBtn = document.querySelector('.close-modal');
const scanBtn = document.getElementById('scanBtn');
const prescriptionInput = document.getElementById('prescriptionInput');
const ocrLoading = document.getElementById('ocrLoading');
const ocrProgress = document.getElementById('ocrProgress');
const autocompleteResults = document.getElementById('autocompleteResults');
let searchTimeout = null;

// Event Listeners
searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        autocompleteResults.classList.add('hidden');
        handleSearch();
    }
});

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 3) {
        autocompleteResults.classList.add('hidden');
        return;
    }
    // Debounce API calls by 300ms
    searchTimeout = setTimeout(() => {
        fetchAutocomplete(query);
    }, 300);
});

// Hide dropdown if clicked outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        autocompleteResults.classList.add('hidden');
    }
});
closeModalBtn.addEventListener('click', () => {
    alternativesModal.classList.add('hidden');
});
scanBtn.addEventListener('click', () => prescriptionInput.click());
prescriptionInput.addEventListener('change', handleOCR);

async function handleOCR(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show Scanning UI
    ocrLoading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    resultsSection.innerHTML = '';
    ocrProgress.textContent = '0%';
    
    try {
        const worker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    ocrProgress.textContent = `${Math.round(m.progress * 100)}%`;
                }
            }
        });
        
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();

        console.log("OCR Extracted Text:", text);

        // Very basic extraction: grab the most prominent word, or pass to backend
        // For our current mock frontend text search, let's clean it up:
        const cleanedText = text.replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
        
        // Grab first few significant keywords to throw into search
        const keywords = cleanedText.split(" ").filter(w => w.length > 3).slice(0, 3).join(" ");
        
        searchInput.value = keywords || cleanedText.substring(0, 20);
        ocrLoading.classList.add('hidden');
        
        if (searchInput.value) {
            handleSearch();
        } else {
            alert('No legible text found in image. Please try typing instead.');
        }

    } catch (error) {
        console.error('OCR Error:', error);
        alert('Failed to scan prescription. Please try searching manually.');
        ocrLoading.classList.add('hidden');
    }
}

async function fetchAutocomplete(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/medicines/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        renderAutocomplete(data);
    } catch (error) {
        console.error('Autocomplete Error:', error);
    }
}

function renderAutocomplete(medicines) {
    autocompleteResults.innerHTML = '';
    if (medicines.length === 0) {
        autocompleteResults.innerHTML = `<div class="autocomplete-item"><small>No perfect matches found.</small></div>`;
        autocompleteResults.classList.remove('hidden');
        return;
    }

    // Render top 8 live results
    medicines.slice(0, 8).forEach(med => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.innerHTML = `
            <strong><i class="fa-solid fa-magnifying-glass" style="font-size:0.8rem; color:var(--text-secondary); margin-right:5px;"></i> ${med.brandName}</strong>
            <small>${med.activeIngredient}</small>
        `;
        
        item.addEventListener('click', () => {
            searchInput.value = med.brandName; // Fill the input
            autocompleteResults.classList.add('hidden'); // Hide dropdown
            openMedicineDetails(med); // Directly open the comparison modal
        });
        
        autocompleteResults.appendChild(item);
    });
    
    autocompleteResults.classList.remove('hidden');
}

async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    // Show loading
    loading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    resultsSection.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE_URL}/medicines/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        renderResults(data);
    } catch (error) {
        console.error('Error fetching search results:', error);
        resultsSection.innerHTML = `<p style="color: var(--danger-color)">Failed to fetch results. Ensure backend is running.</p>`;
    } finally {
        loading.classList.add('hidden');
        resultsSection.classList.remove('hidden');
    }
}

function renderResults(medicines) {
    if (medicines.length === 0) {
        resultsSection.innerHTML = `<p>No medicines found matching your query.</p>`;
        return;
    }

    medicines.forEach(med => {
        const card = document.createElement('div');
        card.className = 'med-card';
        card.innerHTML = `
            <span class="badge ${med.isGeneric ? 'generic' : ''}">${med.isGeneric ? 'Jan Aushadhi Generic' : 'Branded'}</span>
            <h3>${med.brandName}</h3>
            <p><i class="fa-solid fa-pills"></i> ${med.activeIngredient}</p>
            <p><i class="fa-solid fa-stethoscope"></i> ${med.therapeuticUse}</p>
            <div class="price">₹${med.price.toFixed(2)}</div>
        `;
        
        card.addEventListener('click', () => openMedicineDetails(med));
        resultsSection.appendChild(card);
    });
}

async function openMedicineDetails(medicine) {
    // Populate basic info
    document.getElementById('modalBrandName').textContent = medicine.brandName;
    document.getElementById('modalTherapeutic').textContent = medicine.therapeuticUse;
    document.getElementById('modalIngredient').innerHTML = `<i class="fa-solid fa-vial"></i> ${medicine.activeIngredient}`;
    
    // Handle generic vs branded display initialization
    let brandPriceDisplay = `₹${medicine.price.toFixed(2)}`;
    if (medicine.isGeneric) {
        document.getElementById('modalBrandPrice').textContent = `N/A`;
        document.getElementById('modalGenericPrice').textContent = `₹${medicine.price.toFixed(2)}`;
        document.getElementById('savingsAmount').textContent = `Verified Generic`;
        brandPriceDisplay = "N/A";
    } else {
        document.getElementById('modalBrandPrice').textContent = brandPriceDisplay;
        document.getElementById('modalGenericPrice').textContent = `N/A`;
        document.getElementById('savingsAmount').textContent = `...`;
    }
    
    const altListContainer = document.getElementById('alternativesList');
    altListContainer.innerHTML = '<p>Loading alternatives...</p>';
    
    const pharmListContainer = document.getElementById('pharmaciesList');
    pharmListContainer.innerHTML = '<p>Locating pharmacies...</p>';

    alternativesModal.classList.remove('hidden');

    try {
        // Fetch alternatives
        const altResponse = await fetch(`${API_BASE_URL}/medicines/${medicine.id}/alternatives`);
        const alternatives = await altResponse.json();
        
        renderAlternatives(alternatives, brandPriceDisplay, altListContainer);

        // Fetch pharmacies
        const pharmResponse = await fetch(`${API_BASE_URL}/pharmacies?lat=0&lng=0`);
        const pharmacies = await pharmResponse.json();
        
        renderPharmacies(pharmacies, pharmListContainer);

    } catch (error) {
        console.error('Error fetching details:', error);
        altListContainer.innerHTML = '<p style="color:var(--danger-color)">Error loading alternatives.</p>';
        pharmListContainer.innerHTML = '<p style="color:var(--danger-color)">Error loading pharmacies.</p>';
    }
}

function renderAlternatives(alternatives, brandPrice, container) {
    container.innerHTML = '';
    
    if (alternatives.length === 0) {
        container.innerHTML = `<p style="color:var(--text-secondary)">No cheaper generic alternatives found for this active ingredient in our current database.</p>`;
        return;
    }

    // Sort by price ascending
    alternatives.sort((a, b) => a.price - b.price);
    const bestAlternative = alternatives[0];

    // Update highlights
    if (brandPrice !== "N/A") {
        const numericBrandPrice = parseFloat(brandPrice.replace('₹', ''));
        document.getElementById('modalGenericPrice').textContent = `₹${bestAlternative.price.toFixed(2)}`;
        
        const savings = ((numericBrandPrice - bestAlternative.price) / numericBrandPrice) * 100;
        if(savings > 0) {
            document.getElementById('savingsAmount').textContent = `${savings.toFixed(0)}%`;
        } else {
            document.getElementById('savingsAmount').textContent = `0%`;
        }
    } else {
        // If we clicked a generic and found other generics
        if (bestAlternative.price < parseFloat(document.getElementById('modalGenericPrice').textContent.replace('₹', ''))) {
            document.getElementById('modalGenericPrice').textContent = `₹${bestAlternative.price.toFixed(2)}`;
            document.getElementById('savingsAmount').textContent = `Even Cheaper Alternative Found!`;
        }
    }

    // Render list
    alternatives.forEach(alt => {
        const div = document.createElement('div');
        div.className = 'alt-item';
        div.innerHTML = `
            <div>
                <h4>${alt.brandName}</h4>
                <p style="font-size:0.85rem; color:var(--text-secondary)">${alt.manufacturer}</p>
            </div>
            <div class="price">₹${alt.price.toFixed(2)}</div>
        `;
        container.appendChild(div);
    });
}

function renderPharmacies(pharmacies, container) {
    container.innerHTML = '';
    
    if (pharmacies.length === 0) {
        container.innerHTML = `<p>No nearby pharmacies found.</p>`;
        return;
    }

    pharmacies.forEach(pharm => {
        const isLimited = pharm.status === 'Limited Stock';
        const div = document.createElement('div');
        div.className = 'pharmacy-item';
        div.innerHTML = `
            <div class="name-dist">
                <h4>${pharm.name} ${pharm.isJanAushadhi ? '<i class="fa-solid fa-star" style="color:gold" title="Jan Aushadhi Kendra"></i>' : ''}</h4>
                <p><i class="fa-solid fa-location-dot"></i> ${pharm.distance} away</p>
            </div>
            <span class="status-badge ${isLimited ? 'limited' : ''}">${pharm.status}</span>
        `;
        container.appendChild(div);
    });
}
