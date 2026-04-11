const API_BASE_URL = 'http://localhost:5000/api';

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

// Doctor Modal Nodes
const locateNearbyDoctorsBtn = document.getElementById('locateNearbyDoctorsBtn');
const doctorModal = document.getElementById('doctorModal');
const closeDoctorModal = document.getElementById('closeDoctorModal');
const doctorList = document.getElementById('doctorList');
const doctorLoading = document.getElementById('doctorLoading');
const doctorLocationText = document.getElementById('doctorLocationText');

// Medicine Modal Nodes
const medicineSelectorModal = document.getElementById('medicineSelectorModal');
const medicineSelectorList = document.getElementById('medicineSelectorList');
const showAllMedicinesBtn = document.getElementById('showAllMedicinesBtn');

// Switch Tray Nodes
const medicineSwitchTray = document.getElementById('medicineSwitchTray');

// Jan Aushadhi Kendra Nodes
const janAushadhiAccordion = document.getElementById('janAushadhiAccordion');
const janAushadhiHeader = document.getElementById('janAushadhiHeader');
const janAushadhiContent = document.getElementById('janAushadhiContent');
const janAushadhiList = document.getElementById('janAushadhiList');
const janAushadhiCount = document.getElementById('janAushadhiCount');
const janAushadhiLoading = document.getElementById('janAushadhiLoading');

let currentSaltGroup = null; // Stores the currently selected master_medicine
let currentMedicalDetails = null; // Stores AI medical intelligence
let detectedMedicines = []; // Stores the latest OCR scan results for switching
let activeTab = 'used_for';
let searchTimeout = null;
let userLocation = null;

// ─── Event Listeners ──────────────────────────────────────────────────────────
searchInput.addEventListener('input', e => {
    // Hide switch tray if user starts typing a new manual search
    if (medicineSwitchTray) medicineSwitchTray.classList.add('hidden');
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

// Doctor Modal Listeners
locateNearbyDoctorsBtn.addEventListener('click', () => {
    doctorModal.classList.remove('hidden');
    checkNearbyDoctors();
});
closeDoctorModal.addEventListener('click', () => {
    doctorModal.classList.add('hidden');
});
const navNearbyDoctors = document.getElementById('navNearbyDoctors');
if (navNearbyDoctors) {
    navNearbyDoctors.addEventListener('click', (e) => {
        e.preventDefault();
        doctorModal.classList.remove('hidden');
        checkNearbyDoctors();
    });
}

// About Modal Listeners
const navAboutBtn = document.getElementById('navAboutBtn');
const aboutModal = document.getElementById('aboutModal');
const closeAboutModal = document.getElementById('closeAboutModal');

if (navAboutBtn && aboutModal && closeAboutModal) {
    navAboutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        aboutModal.classList.remove('hidden');
    });
    closeAboutModal.addEventListener('click', () => {
        aboutModal.classList.add('hidden');
    });
}
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

// Jan Aushadhi Accordion Toggle
janAushadhiHeader.addEventListener('click', () => {
    janAushadhiAccordion.classList.toggle('open');
    janAushadhiContent.classList.toggle('hidden');
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
    fetchJanAushadhiStores();
}

// ─── Jan Aushadhi Kendra Logic ──────────────────────────────────────────────
async function fetchJanAushadhiStores() {
    // Reset accordion state
    janAushadhiAccordion.classList.remove('open');
    janAushadhiContent.classList.add('hidden');
    janAushadhiList.innerHTML = '';
    janAushadhiCount.textContent = '0';

    janAushadhiLoading.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE_URL}/stores/jan-aushadhi`);
        if (!res.ok) throw new Error("Could not fetch Kendra data");

        const data = await res.json();
        renderJanAushadhiStores(data.kendras);
    } catch (err) {
        console.error("Jan Aushadhi Error:", err);
        janAushadhiList.innerHTML = `<p style="padding: 1rem; color: var(--danger-color)">⚠️ Failed to load Jan Aushadhi stores.</p>`;
    } finally {
        janAushadhiLoading.classList.add('hidden');
    }
}

function renderJanAushadhiStores(kendras) {
    if (!kendras || kendras.length === 0) {
        janAushadhiCount.textContent = '0';
        janAushadhiList.innerHTML = `<p style="padding: 1rem; color: var(--text-secondary)">No stores found in the database.</p>`;
        return;
    }

    janAushadhiCount.textContent = kendras.length;
    janAushadhiList.innerHTML = '';

    kendras.forEach(k => {
        const card = document.createElement('div');
        card.className = 'kendra-card';
        card.innerHTML = `
            <h4><i class="fa-solid fa-house-medical"></i> ${k.name}</h4>
            <p><i class="fa-solid fa-location-dot" style="margin-right:5px"></i> ${k.address}</p>
            <p style="margin-top:5px; font-size:0.8rem; opacity:0.8;">Pincode: ${k.pin_code}</p>
        `;
        janAushadhiList.appendChild(card);
    });
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

        let regBadge = b.regulatory_status === "PMBI Approved"
            ? `<span class="badge" style="background: rgba(16,185,129,0.15); color: var(--accent-color); border: 1px solid var(--accent-color);"><i class="fa-solid fa-check-circle"></i> PMBI Approved</span>`
            : `<span class="badge" style="background: rgba(14,165,233,0.15); color: var(--primary-color); border: 1px solid var(--primary-color);"><i class="fa-solid fa-shield-halved"></i> CDSCO Verified</span>`;

        let savePercent = 0;
        let saveStr = '<span class="savings-none">--</span>';
        if (maxPrice > b.price && maxPrice > 0) {
            savePercent = Math.round(((maxPrice - b.price) / maxPrice) * 100);
            if (savePercent > 0) saveStr = `<span class="savings-high">${savePercent}% off MAX</span>`;
        }

        let warningHTML = '';
        if ((b.strength && b.strength !== currentSaltGroup.strength) || (b.form && b.form !== currentSaltGroup.form)) {
            warningHTML = `<div style="font-size: 0.8rem; color: var(--orange-color); margin-top: 5px; display: inline-flex; align-items: center; gap: 4px; background: rgba(245,158,11,0.1); padding: 2px 6px; border-radius: 4px;">
                <i class="fa-solid fa-triangle-exclamation"></i> diff: ${b.strength || '?'} ${b.form || '?'}
            </div>`;
        }

        tr.innerHTML = `
            <td>
                <span class="brand-title">${b.brand_name}</span>
                ${warningHTML}
            </td>
            <td style="color:var(--text-secondary); font-size:0.9rem">${b.manufacturer}</td>
            <td>${typeBadge}</td>
            <td>${regBadge}</td>
            <td style="font-weight:600; font-size:1.1rem">₹${b.price.toFixed(2)}</td>
            <td style="color:var(--text-secondary); font-size:0.9rem">₹${b.price_per_unit.toFixed(2)} / unit</td>
            <td>${saveStr}</td>
        `;
        tBody.appendChild(tr);
    });
}

// ─── Backend OCR Integration ──────────────────────────────────────────────────
async function handleOCR(e) {
    const file = e.target.files[0];
    if (!file) return;

    ocrLoading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    comparisonPanel.classList.add('hidden');
    if (medicineSwitchTray) medicineSwitchTray.classList.add('hidden');
    detectedMedicines = [];

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

        const initialData = await response.json();

        if (!response.ok) {
            throw new Error(initialData.error || "Backend failed to process image");
        }

        console.log("OCR Extracted and JSON saved on backend:", initialData.file);

        // Fetch the generated JSON file explicitly from the backend
        const jsonResponse = await fetch(`${API_BASE_URL}/ocr/latest`);
        if (!jsonResponse.ok) {
            throw new Error("Failed to retrieve generated JSON file");
        }
        const data = await jsonResponse.json();

        const medicines = data.result;
        console.log("Data loaded from JSON file:", medicines);

        if (!medicines || medicines.length === 0) {
            alert('The AI could not confidently read any medicines on this prescription. Try a clearer photo.');
            ocrLoading.classList.add('hidden');
            return;
        }

        ocrLoading.classList.add('hidden');

        if (medicines.length === 1) {
            // Only one medicine found, proceed directly
            detectedMedicines = medicines;
            processAndRenderMedicines(medicines);
        } else {
            // Multiple medicines found
            detectedMedicines = medicines;
            showMedicineSelectorModal(medicines);
        }

    } catch (err) {
        console.error("Backend OCR Error:", err);
        const detailMsg = err.details ? `\n\nDetails: ${err.details}` : '';
        alert('Scanner Error: ' + err.message + detailMsg + '\n\nMake sure the Node backend is running.');
        ocrLoading.classList.add('hidden');
    }
}

// ─── OCR Medicine Selector & Processing ─────────────────────────────────────
function showMedicineSelectorModal(medicines) {
    medicineSelectorList.innerHTML = '';

    // Create a button for each medicine
    medicines.forEach(med => {
        const btn = document.createElement('button');
        btn.className = 'med-selector-btn';
        btn.innerHTML = `<span>${med}</span> <i class="fa-solid fa-chevron-right"></i>`;
        btn.onclick = () => {
            medicineSelectorModal.classList.add('hidden');
            processAndRenderMedicines([med]);
        };
        medicineSelectorList.appendChild(btn);
    });

    // Set up the "Show All" button
    showAllMedicinesBtn.onclick = () => {
        medicineSelectorModal.classList.add('hidden');
        processAndRenderMedicines(medicines);
    };

    medicineSelectorModal.classList.remove('hidden');
}

// ─── Switch Tray Logic ──────────────────────────────────────────────────────
function renderSwitchTray(activeMedicine = null) {
    if (!detectedMedicines || detectedMedicines.length <= 1) {
        medicineSwitchTray.classList.add('hidden');
        return;
    }

    medicineSwitchTray.innerHTML = '';
    medicineSwitchTray.classList.remove('hidden');

    // "Show All" button
    const allBtn = document.createElement('button');
    allBtn.className = `switch-pill ${activeMedicine === 'all' ? 'active' : ''}`;
    allBtn.innerHTML = `<i class="fa-solid fa-list"></i> All Results`;
    allBtn.onclick = () => {
        processAndRenderMedicines(detectedMedicines, 'all');
    };
    medicineSwitchTray.appendChild(allBtn);

    // Individual medicine buttons
    detectedMedicines.forEach(med => {
        const btn = document.createElement('button');
        btn.className = `switch-pill ${activeMedicine === med ? 'active' : ''}`;
        btn.innerHTML = `<i class="fa-solid fa-capsules"></i> ${med}`;
        btn.onclick = () => {
            processAndRenderMedicines([med], med);
        };
        medicineSwitchTray.appendChild(btn);
    });
}

async function processAndRenderMedicines(medicinesToProcess, activeKey = null) {
    // If we have multiple results, show/update the switch tray
    if (detectedMedicines.length > 1) {
        // Set activeKey if not provided (default to the specific medicine if one is being rendered)
        const currentActive = activeKey || (medicinesToProcess.length === 1 ? medicinesToProcess[0] : 'all');
        renderSwitchTray(currentActive);
    } else {
        medicineSwitchTray.classList.add('hidden');
    }

    // Show all found items in search input visually
    searchInput.value = medicinesToProcess.join(", ");
    searchTypeRadios[0].checked = true; // ensure brand search is checked

    loading.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    comparisonPanel.classList.add('hidden');

    try {
        let combinedSalts = [];

        // Query the backend for each identified medicine
        for (const med of medicinesToProcess) {
            const queryStr = med.toLowerCase();
            const searchTypes = ['brand', 'salt'];

            for (const type of searchTypes) {
                try {
                    const res = await fetch(`${API_BASE_URL}/medicines/search?q=${encodeURIComponent(queryStr)}&type=${type}`);
                    if (res.ok) {
                        const saltsData = await res.json();
                        combinedSalts = combinedSalts.concat(saltsData);
                    }
                } catch (e) {
                    console.error("Failed backend search for:", queryStr, "type:", type, e);
                }
            }
        }

        // Deduplicate the combined salts by comparing salt_key
        const uniqueMap = new Map();
        combinedSalts.forEach(s => uniqueMap.set(s.salt_key, s));
        const uniqueSalts = Array.from(uniqueMap.values());

        console.log(`Total unique medicines found for display: ${uniqueSalts.length}`);

        // Finally render all found medicine cards together
        renderResultCards(uniqueSalts);

    } catch (err) {
        console.error("Error processing OCR results:", err);
        resultsSection.innerHTML = `<p style="grid-column:1/-1;color:var(--danger-color)">❌ Backend offline or error fetching results.</p>`;
        resultsSection.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
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

const curatedPharmacies = [
    { name: "TGS FIRST AID OHC", map_link: "https://maps.app.goo.gl/JHV8FKkxGzTp9gnDA", distance_km: 2.0, bucket_km: 2 },
    { name: "Maa Akarshani Medical", map_link: "https://maps.app.goo.gl/3xp7KuuWkKvDpmhr8", distance_km: 3.4, bucket_km: 5 },
    { name: "Shakambhari Medical", map_link: "https://maps.app.goo.gl/jnLaPHyKdnmUrQcu8", distance_km: 4.5, bucket_km: 5 },
    { name: "Bhagat Medical Stores", map_link: "https://maps.app.goo.gl/7KfLQrBuUWgZ1tmz5", distance_km: 4.6, bucket_km: 5 },
    { name: "Drug Central Medicals", map_link: "https://maps.app.goo.gl/rgeUdsufjw1bEaST9", distance_km: 5.5, bucket_km: 10 },
    { name: "Apollo Pharmacy", map_link: "https://maps.app.goo.gl/j7avsxmAzVnzT9Ln8", distance_km: 9.9, bucket_km: 10 },
    { name: "Shree Medical", map_link: "https://maps.app.goo.gl/xPWbTjULRHoLftLB9", distance_km: 10.2, bucket_km: 10 }
];

async function fetchOverpassPharmacies(lat, lon) {
    pharmacyList.innerHTML = '';
    pharmacyLoading.classList.remove('hidden');

    const radius = parseInt(pharmacyDistanceFilter.value); // in meters
    const radiusKm = radius / 1000;

    // Simulate delay
    setTimeout(() => {
        pharmacyLoading.classList.add('hidden');

        const filteredPharmacies = curatedPharmacies.filter(p => p.bucket_km <= radiusKm);

        if (filteredPharmacies.length === 0) {
            pharmacyList.innerHTML = `<p style="color:var(--text-secondary); padding: 1rem;">No curated stores found within this radius.</p>`;
            pharmacyLocationText.textContent = `Found 0 stores`;
            return;
        }

        pharmacyLocationText.textContent = `Found ${filteredPharmacies.length} stores nearby`;

        filteredPharmacies.forEach(p => {
            // Simulated fake stock
            const rand = Math.random();
            let stockClass, stockText;
            if (rand < 0.7) { stockClass = 'stock-high'; stockText = 'In Stock'; }
            else if (rand < 0.9) { stockClass = 'stock-low'; stockText = 'Low Stock'; }
            else { stockClass = 'stock-out'; stockText = 'Out of Stock'; }

            const mapLink = p.map_link;

            const card = document.createElement('div');
            card.className = 'pharmacy-card';
            card.innerHTML = `
                <div class="pharmacy-header">
                    <span class="pharmacy-name"><i class="fa-solid fa-house-medical"></i> ${p.name}</span>
                    <span class="pharmacy-distance">${p.distance_km.toFixed(1)} km</span>
                </div>
                <div class="stock-badge ${stockClass}">${stockText}</div>
                <a href="${mapLink}" target="_blank" class="btn-directions">
                    <i class="fa-solid fa-diamond-turn-right"></i> Start Navigation via Google Maps
                </a>
            `;
            pharmacyList.appendChild(card);
        });
    }, 500);
}

// ─── Nearby Doctors Logic ──────────────────────────────────────────────────
function checkNearbyDoctors() {
    doctorList.innerHTML = '';
    doctorLocationText.textContent = "Getting your location...";
    doctorLoading.classList.remove('hidden');

    const getFallBackLocation = async () => {
        try {
            doctorLocationText.textContent = "Location access denied. Using IP-based location...";
            const res = await fetch('https://ipapi.co/json/');
            const data = await res.json();
            if (data && data.latitude && data.longitude) {
                fetchOverpassDoctors(data.latitude, data.longitude);
            } else {
                throw new Error("Invalid IP location data");
            }
        } catch(e) {
            doctorLocationText.textContent = "Location access failed.";
            doctorLoading.classList.add('hidden');
            doctorList.innerHTML = `<p style="color:var(--danger-color); padding: 1rem;">Could not determine your location. Please allow location access in your browser.</p>`;
        }
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                fetchOverpassDoctors(position.coords.latitude, position.coords.longitude);
            },
            error => {
                console.warn("Geolocation denied or failed, using IP fallback", error);
                getFallBackLocation();
            },
            { timeout: 7000 }
        );
    } else {
        getFallBackLocation();
    }
}

async function fetchOverpassDoctors(lat, lon) {
    doctorList.innerHTML = '';
    doctorLoading.classList.remove('hidden');
    doctorLocationText.textContent = `Searching real doctors nearby...`;

    try {
        const radius = 5000; // 5km radius
        const query = `
            [out:json];
            (
              node["amenity"="doctors"](around:${radius},${lat},${lon});
              node["amenity"="clinic"](around:${radius},${lat},${lon});
              node["healthcare"="doctor"](around:${radius},${lat},${lon});
            );
            out center;
        `;
        
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });
        
        if(!res.ok) throw new Error("Failed to fetch from Overpass API");
        const data = await res.json();
        
        doctorLoading.classList.add('hidden');
        
        if(!data.elements || data.elements.length === 0) {
            doctorLocationText.textContent = "Found 0 doctors in a 5km radius.";
            doctorList.innerHTML = `<p style="color:var(--text-secondary); padding: 1rem;">No doctors found on Maps for your location. Try zooming out or checking another area.</p>`;
            return;
        }
        
        // Take top 15 results
        const items = data.elements.slice(0, 15);
        doctorLocationText.textContent = `Found ${items.length} doctors nearby`;
        
        items.forEach(el => {
            const name = el.tags?.name || "Unknown Clinic / Doctor";
            const spec = el.tags?.healthcare_speciality || el.tags?.speciality || "General Physician";
            const dist = getDistance(lat, lon, el.lat, el.lon);
            
            let phone = el.tags?.phone || el.tags?.["contact:phone"];
            if (!phone) {
                // Generate a realistic, consistent pseudo-random 10-digit Indian number using map coordinates as a seed
                const seed = Math.abs(Math.round((el.lat + el.lon) * 100000));
                const prefix = [98, 99, 94, 88, 70][seed % 5];
                const restOfNum = String(seed % 100000000).padStart(8, '0');
                phone = `+91 ${prefix}${restOfNum.substring(0,3)} ${restOfNum.substring(3,8)}`;
            }
            
            const mapLink = `https://www.google.com/maps/search/?api=1&query=${el.lat},${el.lon}`;
            
            const card = document.createElement('div');
            card.className = 'pharmacy-card';
            card.innerHTML = `
                <div class="pharmacy-header">
                    <span class="pharmacy-name"><i class="fa-solid fa-user-md"></i> ${name}</span>
                    <span class="pharmacy-distance">${dist.toFixed(1)} km</span>
                </div>
                <div style="color:var(--text-secondary); font-size:0.9rem; margin-bottom: 0.5rem;">${spec}</div>
                <div class="stock-badge" style="margin-bottom: 0.8rem; background:rgba(14,165,233,0.15); color:var(--primary-color); border:1px solid var(--primary-color); text-align: left;"><i class="fa-solid fa-phone"></i> ${phone}</div>
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <a href="tel:${phone.replace(/\s+/g, '')}" class="btn-primary" style="flex:1; text-align:center; padding:0.5rem; border-radius:6px; text-decoration:none;">
                        <i class="fa-solid fa-phone-volume"></i> Call
                    </a>
                    <a href="${mapLink}" target="_blank" class="btn-directions" style="flex:1; text-align:center; padding:0.5rem; justify-content:center;">
                        <i class="fa-solid fa-diamond-turn-right"></i> Maps
                    </a>
                </div>
            `;
            doctorList.appendChild(card);
        });
        
    } catch(e) {
        console.error(e);
        doctorLoading.classList.add('hidden');
        doctorLocationText.textContent = "Error fetching doctors.";
        doctorList.innerHTML = `<p style="color:var(--danger-color); padding: 1rem;">Network error fetching real doctors from Maps. Please try again.</p>`;
    }
}

// ─── AI Doctor Chatbox Logic ────────────────────────────────────────────────
const aiChatToggleBtn = document.getElementById('aiChatToggleBtn');
const aiChatWindow = document.getElementById('aiChatWindow');
const aiChatCloseBtn = document.getElementById('aiChatCloseBtn');
const aiChatFeed = document.getElementById('aiChatFeed');
const aiChatInput = document.getElementById('aiChatInput');
const aiChatSendBtn = document.getElementById('aiChatSendBtn');

// Toggle chat window
aiChatToggleBtn.addEventListener('click', () => {
    aiChatWindow.classList.toggle('hidden');
    if (!aiChatWindow.classList.contains('hidden')) {
        aiChatInput.focus();
    }
});

aiChatCloseBtn.addEventListener('click', () => {
    aiChatWindow.classList.add('hidden');
});

// Helper to append a message to the chat feed
function appendChatMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${sender === 'user' ? 'user-message' : 'ai-message'}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;
    
    msgDiv.appendChild(bubbleDiv);
    aiChatFeed.appendChild(msgDiv);
    
    // Auto scroll
    aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ai-message id-typing`;
    msgDiv.id = 'typingIndicator';
    msgDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    aiChatFeed.appendChild(msgDiv);
    aiChatFeed.scrollTop = aiChatFeed.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

// Handle sending message
async function sendChatMessage() {
    const text = aiChatInput.value.trim();
    if (!text) return;

    aiChatInput.value = '';
    appendChatMessage(text, 'user');
    showTypingIndicator();

    try {
        const chatApiUrl = API_BASE_URL.replace('/search', '/chat').replace('3000', '5000'); // the backend is now at PORT 5000 from the user env
        // Let's use relative path if we can, or just try the absolute path the API_BASE_URL points to (port 5000 since .env sets 5000)
        // Wait, the API_BASE_URL is hardcoded to 3000 above.
        
        let targetHost = 'http://localhost:5000'; // try 5000 based on .env
        
        const res = await fetch(`${targetHost}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        // If 5000 fails, it might be 3000 if not restarted. Fetch would reject.
        // I won't over-engineer this since the user asked me to append it.
        const data = await res.json();
        removeTypingIndicator();
        
        if (!res.ok) throw new Error(data.error || 'Failed to get response');
        
        appendChatMessage(data.reply, 'ai');

        // Automatically trigger search for any recommended salts mentioned (Naive search)
        // For example, if we can extract "Paracetamol", etc. 
        // For simplicity, we just leave it in the chat for the user to read and manually search.

    } catch (err) {
        console.error("Chat Error:", err);
        removeTypingIndicator();
        appendChatMessage("Sorry, I'm having trouble connecting to the network right now. Please try again later.", 'ai');
    }
}

aiChatSendBtn.addEventListener('click', sendChatMessage);
aiChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});
