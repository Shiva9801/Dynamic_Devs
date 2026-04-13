# Medicine Access Platform 💊

A modern, comprehensive web application designed to help users find affordable generic alternatives (Jan Aushadhi) to expensive branded medicines in India. The platform uses AI-powered tools, location-based services, and intelligent datasets to provide price comparisons, clinical insights, and pharmacy availability.

## ✨ Features

- **Price & Branded Comparison:** Search by Brand or Salt composition. Instantly see price differences between expensive brands and PMBJP (Pradhan Mantri Bhartiya Janaushadhi Pariyojana) generics.
- **AI Prescription Scanner (OCR):** Upload a photo of your prescription. The platform uses advanced Vision AI models (via OpenRouter/Gemma) to extract medicine names and automatically compare them.
- **Medical Intelligence System:** View clinical details including Cures, Key Benefits, Usage, Age-specific Dosages, and Side Effects, powered by Google's Gemini models with robust rate-limit fallbacks.
- **Dosage & Form Warnings:** Smart discrepancy detection alerts you if a generic alternative differs in strength (e.g., 250mg vs 125mg) or physical form (e.g., Syrup vs Tablet).
- **Nearby Pharmacy Locator:** Locate nearby Google Maps-verified pharmacies to find available stocks with one click navigation routing.
- **Jan Aushadhi Kendra Integration:** Find verified Jan Aushadhi Kendras with their precise address and pincodes dynamically appearing based on your selected medicine.
- **Regulatory Badging:** Visual transparency for medication origins. "PMBI Approved" badges for official PMBJP generics and "CDSCO Verified" for branded equivalents.
- **Premium UI/UX:** Built with a state-of-the-art Glassmorphism design system, smooth animations, rotating accordions, and a highly responsive grid layout.

## 🛠️ Technology Stack

- **Frontend:** Vanilla HTML, CSS (Glassmorphism), JavaScript
- **Backend:** Node.js, Express.js
- **Database / Data layer:** Local JSON Datasets (Relational schema via mapping)
- **AI Integrations:** 
  - Google Gemini API (Medical Intelligence)
  - OpenRouter API (Prescription Vision OCR)

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Shiva9801/Dynamic_Devs.git
   cd medicine-access-platform
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```
   *Create a `.env` file inside the `backend` folder and add your API keys:*
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   PORT=3000
   ```

3. **Start the Backend Server**
   ```bash
   node server.js
   ```
   *The backend will run at `http://localhost:3000`.*

4. **Frontend Setup & Execution**
   Open a new terminal window:
   ```bash
   cd frontend
   npx serve -l 5000 ./
   ```

5. **View the Application**
   Open your browser and navigate to `http://localhost:5000`.

## 📁 Project Structure

```
medicine-access-platform/
│
├── backend/
│   ├── data/
│   │   ├── all_matches.json          # Cross-referenced generic/brand relations
│   │   ├── medicines.json            # PMBJP Generics Database
│   │   ├── offline.json              # Branded CDSCO database
│   │   └── jan_aushadhi_kendras.json # Location network
│   ├── server.js                     # Express API Server & Data Logic
│   └── package.json
│
├── frontend/
│   ├── index.html                    # Main App UI
│   ├── app.js                        # Core logic, DOM manipulation & API Fetching
│   └── styles.css                    # Glassmorphism Design System
│
└── README.md
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](#). 

## 📜 License
This project is open-source and available under the MIT License.
