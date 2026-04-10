const API_BASE_URL = `http://${window.location.hostname}:3000/api`;

// ─── DOM References ───────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchTypeRadios = document.getElementsByName('searchType');
const scanBtn = document.getElementById('scanBtn');
const prescriptionInput = document.getElementById('prescriptionInput');
const ocrLoading = document.getElementById('ocrLoading');
const ocrProgress = document.getElementById('ocrProgress'); // Can be safely removed but kept for compatibility just in case
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const autocompleteEl = document.getElementById('autocompleteResults');
const comparisonPanel = document.getElementById('comparisonPanel');
const backBtn = document.getElementById('backBtn');
const applyFiltersBtn = document.getElementById('applyFilters');

// Table and Summary Dom Nodes
const tBody = document.getElementById('alternativesTableBody');
const filterSort = document.getElementById('filterSort');
const filterType = document.getElementById('filterType');
const filterAvailable = document.getElementById('filterAvailable');

// Pharmacy Modal Nodes
const locateNearbyBtn = document.getElementById('locateNearbyBtn');
const pharmacyModal = document.getElementById('pharmacyModal');
const closePharmacyModal = document.getElementById('closePharmacyModal');
const pharmacyDistanceFilter = document.getElementById('pharmacyDistanceFilter');
const pharmacyList = document.getElementById('pharmacyList');
const pharmacyLoading = document.getElementById('pharmacyLoading');
const pharmacyLocationText = document.getElementById('pharmacyLocationText');

let currentSaltGroup = null; // Stores the currently selected master_medicine
let currentMedicalDetails = null; // Stores AI medical intelligence
let activeTab = 'used_for';
let searchTimeout = null;
let userLocation = null;

// ─── Event Listeners ──────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 3) return hideAutocomplete();
    searchTimeout = setTimeout(() => fetchAutocomplete(q), 280);
});

document.addEventListener('click', e => { if (!e.target.closest('#searchContainer')) hideAutocomplete(); });
backBtn.addEventListener('click', () => {
    comparisonPanel.classList.add('hidden');
    resultsSection.classList.remove('hidden');
});

scanBtn.addEventListener('click', () => {
    prescriptionInput.click();
});

prescriptionInput.addEventListener('change', handleOCR);

[filterSort, filterType, filterAvailable].forEach(el => {
    el.addEventListener('change', applyFilters);
});

// Pharmacy Modal Listeners
locateNearbyBtn.addEventListener('click', () => {
    pharmacyModal.classList.remove('hidden');
    checkNearbyPharmacies();
});
closePharmacyModal.addEventListener('click', () => {
    pharmacyModal.classList.add('hidden');
});
pharmacyDistanceFilter.addEventListener('change', () => {
    if (userLocation) fetchOverpassPharmacies(userLocation.lat, userLocation.lon);
});

// Tab switching listeners
document.addEventListener('click', e => {
    if (e.target.classList.contains('info-tab')) {
        const tabs = document.querySelectorAll('.info-tab');
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        activeTab = e.target.getAttribute('data-tab');
        renderTabContent();
    }
});

// Helper to get active search type (brand vs salt)
function getSearchType() {
    let type = 'brand';
    for (const radio of searchTypeRadios) {
        if (radio.checked) type = radio.value;
    }
    return type;
}

// ─── Autocomplete / Search ───────────────────────────────────────────────────
async function fetchAutocomplete(query) {
    loading.classList.remove('hidden');
    const type = getSearchType();

    try {
        const res = await fetch(`${API_BASE_URL}/medicines/search?q=${encodeURIComponent(query)}&type=${type}`);
        const data = await res.json(); // Array of master_medicines
        renderResultCards(data);
    } catch (e) {
        resultsSection.innerHTML = `<p style="grid-column:1/-1;color:var(--danger-color)">❌ Backend offline. Run node server.js</p>`;
        resultsSection.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
    }
}

function renderResultCards(salts) {
    resultsSection.innerHTML = '';

    if (!salts || !salts.length) {
        resultsSection.innerHTML = '<p style="grid-column:1/-1;color:var(--text-secondary)">No results found.</p>';
        resultsSection.classList.remove('hidden');
        comparisonPanel.classList.add('hidden');
        return;
    }

    salts.forEach(salt => {
        const card = document.createElement('div');
        card.className = 'med-card glass-card';
        // Get the cheapest generic price if available
        let cheapest = salt.brands.reduce((min, b) => b.price < min ? b.price : min, Infinity);
        if (cheapest === Infinity) cheapest = '--';

        card.innerHTML = `
            <h3>${salt.salt_name.substring(0, 40)}...</h3>
            <p><i class="fa-solid fa-vial" style="margin-right:5px;color:var(--primary-color)"></i> Strength: ${salt.strength}</p>
            <p><i class="fa-solid fa-capsules" style="margin-right:5px;color:var(--text-secondary)"></i> Form: ${salt.form}</p>
            <div class="badge" style="margin-top:10px; background:rgba(255,255,255,0.05)">Starts at ₹${cheapest}</div>
        `;
        card.addEventListener('click', () => openComparisonPanel(salt));
        resultsSection.appendChild(card);
    });

    resultsSection.classList.remove('hidden');
    comparisonPanel.classList.add('hidden');
}

function hideAutocomplete() { /* unused since replacing dropdown with grid view */ }

// ─── Comparison Panel ─────────────────────────────────────────────────────────
function openComparisonPanel(saltObj) {
    currentSaltGroup = saltObj;

    // Show Panel
    resultsSection.classList.add('hidden');
    comparisonPanel.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Populate Summary Card
    document.getElementById('summarySaltName').textContent = saltObj.salt_name;
    document.getElementById('summaryTherapeutic').textContent = saltObj.therapeutic_class;
    document.getElementById('summaryIngredient').textContent = saltObj.compositions.join(', ');
    document.getElementById('summaryStrength').textContent = saltObj.strength;
    document.getElementById('summaryForm').textContent = saltObj.form;

    // Mock Safety Data
    const isDangerous = saltObj.salt_name.toLowerCase().includes('tramadol') || saltObj.salt_name.toLowerCase().includes('injection');
    document.getElementById('safetyRx').textContent = isDangerous ? "Yes (Schedule H1 - Warning)" : "Yes (Schedule H)";
    document.getElementById('safetyWarning').textContent = isDangerous
        ? "Warning: Habit forming. Do not use without strict medical supervision."
        : "Standard precautions apply. Consult your doctor.";

    // Reset Tabs
    activeTab = 'used_for';
    const tabs = document.querySelectorAll('.info-tab');
    tabs.forEach(t => {
        t.getAttribute('data-tab') === 'used_for' ? t.classList.add('active') : t.classList.remove('active');
    });

    applyFilters();
    fetchMedicineDetails(saltObj.salt_key);
}

// ─── Medical Details Fetching & Rendering ──────────────────────────────────
async function fetchMedicineDetails(saltKey) {
    const infoLoading = document.getElementById('infoLoading');
    const infoContent = document.getElementById('infoContent');
    
    infoLoading.classList.remove('hidden');
    infoContent.classList.add('hidden');
    currentMedicalDetails = null;

    try {
        const res = await fetch(`${API_BASE_URL}/medicines/details/${saltKey}`);
        if (!res.ok) throw new Error("Could not fetch clinical details");
        
        currentMedicalDetails = await res.json();
        renderTabContent();
    } catch (err) {
        console.error("Medical Info Error:", err);
        infoContent.innerHTML = `<p style="color:var(--danger-color)">⚠️ Could not load medical intelligence for this salt. Please consult a doctor.</p>`;
        infoContent.classList.remove('hidden');
    } finally {
        infoLoading.classList.add('hidden');
    }
}

function renderTabContent() {
    const infoContent = document.getElementById('infoContent');
    if (!currentMedicalDetails) return;

    infoContent.classList.remove('hidden');
    const data = currentMedicalDetails;

    switch (activeTab) {
        case 'used_for':
            infoContent.innerHTML = `<h3>Used for:</h3><p>${data.used_for}</p>`;
            break;
        case 'benefits':
            infoContent.innerHTML = `<h3>Key Benefits:</h3><p>${data.benefits}</p>`;
            break;
        case 'how_to_use':
            infoContent.innerHTML = `<h3>How to Use:</h3><p>${data.how_to_use}</p>`;
            break;
        case 'dosage':
            infoContent.innerHTML = `
                <h3>Age-Specific Dosage:</h3>
                <div class="dosage-grid">
                    <div class="dosage-card"><h4>Kids</h4><p>${data.dosage.kids}</p></div>
                    <div class="dosage-card"><h4>Adults</h4><p>${data.dosage.adults}</p></div>
                    <div class="dosage-card"><h4>Elderly</h4><p>${data.dosage.elderly}</p></div>
                </div>
            `;
            break;
        case 'side_effects':
            infoContent.innerHTML = `<h3>Side Effects:</h3><p>${data.side_effects}</p>`;
            break;
        case 'substitutes':
            infoContent.innerHTML = `<h3>Suggested Substitutes (Chemical):</h3><p>${data.substitutes}</p>`;
            break;
    }
}

// ─── Alternatives Table Rendering ──────────────────────────────────────────────
function applyFilters() {
    if (!currentSaltGroup) return;

    let brands = [...currentSaltGroup.brands];
    const warnContainer = document.getElementById('dosageWarningContainer');
    warnContainer.innerHTML = '';
    let hasMismatch = false;

    // Ref values from the master salt
    const refStrength = currentSaltGroup.strength;
    const refForm = currentSaltGroup.form;

    // Sort
    const sortVal = filterSort.value;
    brands.sort((a, b) => sortVal === 'asc' ? a.price - b.price : b.price - a.price);

    // Type Filter
    const typeVal = filterType.value;
    if (typeVal === 'generic') brands = brands.filter(b => b.is_generic);
    if (typeVal === 'branded') brands = brands.filter(b => !b.is_generic);

    // Get max price relative to this grouping to calculate savings
    let maxPrice = 0;
    if (brands.length > 0) {
        maxPrice = brands.reduce((max, b) => b.price > max ? b.price : max, 0);
    }

    // Find absolute lowest for "Best Value" badge
    const lowestPrice = brands.length > 0 ? Math.min(...brands.map(b => b.price)) : 0;

    tBody.innerHTML = '';

    if (brands.length === 0) {
        tBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-secondary)">No variants match the current filters.</td></tr>`;
        return;
    }

    brands.forEach(b => {
        const tr = document.createElement('tr');

        let typeBadge = b.is_generic
            ? `<span class="badge generic"><i class="fa-solid fa-leaf"></i> Generic</span>`
            : `<span class="badge branded">Branded</span>`;

        if (b.price === lowestPrice && b.price > 0 && typeVal === 'all') {
            typeBadge += ` <span class="badge best-value" style="margin-left:5px;"><i class="fa-solid fa-crown"></i> Best Value</span>`;
        }

        // Regulatory Status
        let regBadge = '';
        if (b.regulatory_status === 'PMBI Approved') {
            regBadge = `<span class="badge pmbi"><i class="fa-solid fa-certificate"></i> PMBI Approved</span>`;
        } else if (b.regulatory_status === 'CDSCO Verified') {
            regBadge = `<span class="badge cdsco"><i class="fa-solid fa-check-double"></i> CDSCO Verified</span>`;
        }

        // Dosage Mismatch Check
        const strengthMatch = b.strength === refStrength;
        const formMatch = b.form === refForm;
        let doseInfo = '';
        
        if (!strengthMatch || !formMatch) {
            hasMismatch = true;
            doseInfo = `<span class="badge warning" style="margin-top:5px; display:inline-block;"><i class="fa-solid fa-triangle-exclamation"></i> Dose Mismatch: ${b.strength} (${b.form})</span>`;
        }

        let savePercent = 0;
        let saveStr = '<span class="savings-none">--</span>';
        if (maxPrice > b.price && maxPrice > 0) {
            savePercent = Math.round(((maxPrice - b.price) / maxPrice) * 100);
            if (savePercent > 0) saveStr = `<span class="savings-high">${savePercent}% off MAX</span>`;
        }

        tr.innerHTML = `
            <td>
                <span class="brand-title">${b.brand_name}</span>
                <div style="font-size:0.8rem; color:var(--text-secondary)">${b.manufacturer}</div>
                ${doseInfo}
            </td>
            <td>${regBadge}</td>
            <td>${typeBadge}</td>
            <td style="font-weight:600; font-size:1.1rem">₹${b.price.toFixed(2)}</td>
            <td style="color:var(--text-secondary); font-size:0.9rem">₹${b.price_per_unit.toFixed(2)} / unit</td>
            <td>${saveStr}</td>
        `;
        tBody.appendChild(tr);
    });

    if (hasMismatch) {
        warnContainer.innerHTML = `
            <div class="dosage-mismatch-warning">
                <i class="fa-solid fa-circle-exclamation" style="font-size:1.2rem;"></i>
                <div>
                    <strong>Attention: Dosage/Form Differences Found</strong>
                    <p style="font-size:0.85rem; margin-top:2px;">Some alternatives listed have different strengths or forms than the searched medicine. Please consult your doctor/pharmacist to adjust the quantity accordingly.</p>
                </div>
            </div>
        `;
    }
}

// ─── Backend OCR Integration ──────────────────────────────────────────────────
async function handleOCR(e) {
    const file = e.target.files[0];
    if (!file) return;

    ocrLoading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    try {
        // ─── Compress image to max 1024px before sending (reduces token cost ~90%) ───
        const compressImage = (file) => new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const MAX_WIDTH = 1024;
                let { width, height } = img;
                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                // Export as JPEG at 80% quality
                const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                console.log(`🗜️ Image compressed: ${width}x${height}, ${b64.length} chars`);
                resolve(b64);
            };
            img.src = url;
        });

        const b64Data = await compressImage(file);

        // Post to our secure backend
        const response = await fetch(`${API_BASE_URL}/ocr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                base64Image: b64Data,
                mimeType: 'image/jpeg'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Backend failed to process image");
        }

        const medicines = data.result; // This is now guaranteed to be an array by the backend
        console.log("OCR Extracted Array:", medicines);

        if (!medicines || medicines.length === 0) {
             alert('The AI could not confidently read any medicines on this prescription. Try a clearer photo.');
             ocrLoading.classList.add('hidden');
             return;
        }

        // Take the first valid medicine name and pipe it into search
        const finalQuery = medicines[0].toLowerCase();
        console.log("Searching for:", finalQuery);

        searchInput.value = finalQuery;
        ocrLoading.classList.add('hidden');
        
        if (searchInput.value) {
            searchTypeRadios[0].checked = true;
            fetchAutocomplete(searchInput.value);
        }

    } catch (err) {
        console.error("Backend OCR Error:", err);
        const detailMsg = err.details ? `\n\nDetails: ${err.details}` : '';
        alert('Scanner Error: ' + err.message + detailMsg + '\n\nMake sure the Node backend is running.');
        ocrLoading.classList.add('hidden');
    }
}

// ─── Nearby Pharmacies Logic ──────────────────────────────────────────────────
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function fetchRouteDistancesKm(originLat, originLon, destinations) {
    if (!destinations || destinations.length === 0) return [];
    try {
        const coords = [[originLon, originLat], ...destinations.map(d => [d.lon, d.lat])]
            .map(pair => `${pair[0]},${pair[1]}`)
            .join(';');
        const destinationIndexes = destinations.map((_, idx) => idx + 1).join(';');
        const osrmUrl = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destinationIndexes}&annotations=distance`;
        const res = await fetch(osrmUrl);
        if (!res.ok) throw new Error('Routing service unavailable');
        const data = await res.json();
        const row = data.distances && data.distances[0] ? data.distances[0] : [];
        return row.map(meters => (typeof meters === 'number' ? meters / 1000 : null));
    } catch (_) {
        return destinations.map(() => null);
    }
}

function checkNearbyPharmacies() {
    pharmacyList.innerHTML = '';
    if (!navigator.geolocation) {
        pharmacyLocationText.textContent = "Geolocation not supported.";
        return;
    }
    
    pharmacyLocationText.textContent = "Getting exact location...";
    pharmacyLoading.classList.remove('hidden');
    
    navigator.geolocation.getCurrentPosition(
        position => {
            userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
            pharmacyLocationText.textContent = `Location found. Computing route...`;
            fetchOverpassPharmacies(userLocation.lat, userLocation.lon);
        },
        error => {
            pharmacyLocationText.textContent = "Position access denied.";
            pharmacyLoading.classList.add('hidden');
            pharmacyList.innerHTML = `<p style="color:var(--danger-color); padding: 1rem;">Please allow location access in your browser to find original stores nearby.</p>`;
        }
    );
}

async function fetchOverpassPharmacies(lat, lon) {
    pharmacyList.innerHTML = '';
    pharmacyLoading.classList.remove('hidden');
    
    const radius = Number(pharmacyDistanceFilter.value); // in meters
    
    try {
        const res = await fetch(`${API_BASE_URL}/pharmacies/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
        if (!res.ok) {
            let message = "Backend Proxy failed";
            try {
                const errData = await res.json();
                message = errData.details || errData.error || message;
            } catch (_) {
                // keep default message when response body is not JSON
            }
            throw new Error(message);
        }
        const data = await res.json();
        
        pharmacyLoading.classList.add('hidden');
        
        if (!data.elements || data.elements.length === 0) {
            pharmacyList.innerHTML = `<p style="color:var(--text-secondary); padding: 1rem;">No mapped pharmacies found within this radius. Try increasing distance to 10-20 km.</p>`;
            pharmacyLocationText.textContent = `Found 0 stores`;
            return;
        }

        const basePharmacies = data.elements.map(el => {
            const hasCoords = Number.isFinite(el.lat) && Number.isFinite(el.lon);
            const manualDistance = Number(el.tags && el.tags.distance_km);
            const distance = hasCoords ? getDistance(lat, lon, el.lat, el.lon) : (Number.isFinite(manualDistance) ? manualDistance : null);
            const name = el.tags.name || "Local Pharmacy";
            return {
                name,
                lat: hasCoords ? el.lat : null,
                lon: hasCoords ? el.lon : null,
                distance,
                mapLink: (el.tags && el.tags.map_link) || null
            };
        });

        const withCoords = basePharmacies.filter(p => p.lat != null && p.lon != null);
        const routeDistancesForCoords = await fetchRouteDistancesKm(lat, lon, withCoords);
        const routeDistances = [];
        let routeIdx = 0;
        for (const p of basePharmacies) {
            if (p.lat != null && p.lon != null) {
                routeDistances.push(routeDistancesForCoords[routeIdx] ?? null);
                routeIdx++;
            } else {
                routeDistances.push(null);
            }
        }
        const pharmacies = basePharmacies
            .map((p, idx) => ({
                ...p,
                routeDistance: routeDistances[idx]
            }))
            .sort((a, b) => {
                if (a.routeDistance != null && b.routeDistance != null) return a.routeDistance - b.routeDistance;
                if (a.routeDistance != null) return -1;
                if (b.routeDistance != null) return 1;
                if (a.distance != null && b.distance != null) return a.distance - b.distance;
                if (a.distance != null) return -1;
                if (b.distance != null) return 1;
                return 0;
            });
        
        pharmacyLocationText.textContent = `Found ${pharmacies.length} stores nearby`;

        pharmacies.forEach(p => {
            // Simulated fake stock
            let hash = 0;
            for (const ch of p.name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
            const bucket = hash % 10;
            let stockClass, stockText;
            if (bucket < 6) { stockClass = 'stock-high'; stockText = 'In Stock'; }
            else if (bucket < 8) { stockClass = 'stock-low'; stockText = 'Low Stock'; }
            else { stockClass = 'stock-out'; stockText = 'Out of Stock'; }

            const mapLink = p.mapLink || (p.lat != null && p.lon != null
                ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
                : 'https://www.google.com/maps');

            const card = document.createElement('div');
            card.className = 'pharmacy-card';
            card.innerHTML = `
                <div class="pharmacy-header">
                    <span class="pharmacy-name"><i class="fa-solid fa-house-medical"></i> ${p.name}</span>
                    <span class="pharmacy-distance">${p.routeDistance != null ? `${p.routeDistance.toFixed(1)} km by road` : (p.distance != null ? `~${p.distance.toFixed(1)} km` : 'Distance unavailable')}</span>
                </div>
                <div class="stock-badge ${stockClass}">${stockText}</div>
                <a href="${mapLink}" target="_blank" class="btn-directions">
                    <i class="fa-solid fa-diamond-turn-right"></i> Start Navigation via Google Maps
                </a>
            `;
            pharmacyList.appendChild(card);
        });

    } catch (err) {
        pharmacyLoading.classList.add('hidden');
        pharmacyLocationText.textContent = "Service busy. Please retry.";
        pharmacyList.innerHTML = `<p style="color:var(--danger-color); padding: 1rem;">Unable to load nearby pharmacy data right now.<br>Error Details: ${err.message}<br><br>Tip: wait 10-20 seconds and try again, or increase radius.</p>`;
    }
}

// ─── Jan Aushadhi Kendra list (static addresses, no maps) ───────────────────
const janAushadhiListEl = document.getElementById('janAushadhiList');
const janAushadhiLoadingEl = document.getElementById('janAushadhiLoading');
const janAushadhiErrorEl = document.getElementById('janAushadhiError');

async function loadJanAushadhiKendras() {
    if (!janAushadhiListEl) return;
    janAushadhiLoadingEl?.classList.remove('hidden');
    janAushadhiErrorEl?.classList.add('hidden');
    try {
        const res = await fetch(`${API_BASE_URL}/jan-aushadhi-kendras`);
        if (!res.ok) throw new Error('Could not load list');
        const data = await res.json();
        const titleEl = document.getElementById('janAushadhiTitle');
        const subEl = document.getElementById('janAushadhiSubtitle');
        if (titleEl) titleEl.textContent = data.title || 'Jan Aushadhi Kendras';
        if (subEl) subEl.textContent = data.subtitle || '';
        janAushadhiListEl.innerHTML = (data.kendras || []).map(k => `
            <article class="jan-kendra-card">
                <span class="jan-kendra-sr">${k.sr_no}</span>
                <div class="jan-kendra-body">
                    <div class="jan-kendra-code">${escapeHtml(k.kendra_code)}</div>
                    <h3 class="jan-kendra-name">${escapeHtml(k.name)}</h3>
                    <p class="jan-kendra-meta">Pin ${escapeHtml(k.pin_code)} · ${escapeHtml(k.state_name)} · ${escapeHtml(k.district_name)}</p>
                    <p class="jan-kendra-address">${escapeHtml(k.address)}</p>
                </div>
            </article>
        `).join('');
    } catch (e) {
        console.error('Jan Aushadhi list:', e);
        if (janAushadhiErrorEl) {
            janAushadhiErrorEl.textContent = 'Could not load Jan Aushadhi Kendra list. Is the backend running?';
            janAushadhiErrorEl.classList.remove('hidden');
        }
        janAushadhiListEl.innerHTML = '';
    } finally {
        janAushadhiLoadingEl?.classList.add('hidden');
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

loadJanAushadhiKendras();

document.getElementById('navSearch')?.addEventListener('click', e => {
    e.preventDefault();
    // Return to search view
    comparisonPanel.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    document.querySelector('.hero')?.scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    e.currentTarget.classList.add('active');
});

document.getElementById('navJanAushadhi')?.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    e.currentTarget.classList.add('active');
    // The Jan Aushadhi section lives inside the comparison panel.
    // If it's hidden (no medicine selected yet), just scroll to search.
    if (comparisonPanel.classList.contains('hidden')) {
        document.querySelector('.hero')?.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    // Auto-expand the accordion
    const body = document.getElementById('janAushadhiBody');
    const icon = document.getElementById('janToggleIcon');
    const btn  = document.getElementById('janAushadhiToggle');
    if (body && !body.classList.contains('open')) {
        body.classList.add('open');
        icon?.classList.add('open');
        btn?.setAttribute('aria-expanded', 'true');
    }
    document.getElementById('janAushadhiSection')?.scrollIntoView({ behavior: 'smooth' });
});

// ─── Jan Aushadhi accordion toggles ──────────────────────────────────────────
function setupJanToggle(btnId, bodyId, iconId) {
    const btn  = document.getElementById(btnId);
    const body = document.getElementById(bodyId);
    const icon = document.getElementById(iconId);
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
        const isOpen = body.classList.toggle('open');
        icon?.classList.toggle('open', isOpen);
        btn.setAttribute('aria-expanded', String(isOpen));
    });
}

setupJanToggle('janAushadhiToggle', 'janAushadhiBody', 'janToggleIcon');

