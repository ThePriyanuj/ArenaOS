# ArenaOS - Smart Venue Operations Engine

ArenaOS is a centralized real-time venue operations, crowd dynamics calculations, and AI dispatch hub designed for modern smart stadiums. It integrates fluid dynamics calculations, semantic document retrieval via a local vector database, multilingual voice navigation, and deterministic input guardrails to provide operations staff and spectators with an accessible, high-performance assistant.

---

## 🚀 Key Features

1. **Live Interactive Venue Twin**
   - Interactive, keyboard-navigable SVG vector layout of stadium sections (e.g., Zone A, Zone B).
   - High-fidelity zoom, pan, and interactive zone selector to inspect parameters in real-time.
   - Synchronizes seamlessly with voice commands and manual UI inputs.

2. **Fluid Dynamics Crowd Calculator**
   - Calculates crowd dynamics using standard fluid equations:
     - **Walking Velocity ($v$):** $v = v_0 \times (1 - a \times \rho)^4$ where free-flow velocity $v_0 = 1.34\text{ m/s}$ and structural scaling $a = 0.28$.
     - **Flow Rate ($Q$):** $Q = \rho \times v \times W$ (spectators/s) where $W$ is the channel exit width.
     - **Congestion Index ($C$):** Normalized composite indicator scoring safety status (`SAFE`, `WARNING`, `CRITICAL`) using weighted density, velocity deviation, and acoustic levels.
   - Automatically displays dynamic alert banners recommending actions (e.g., dispersion protocols, concessions promotions) based on safety status.

3. **Guardrail-Protected RAG Operations Guard**
   - Local vector store (ChromaDB) pre-seeded with customized operational guidance documents matching roles (Fan, Staff, Volunteer).
   - Embedding models (`SentenceTransformer("all-MiniLM-L6-v2")`) representing natural language queries.
   - Real-time deterministic input guardrail scanner checking queries against potential threats (e.g., prompt injection, role manipulation, XSS injection, path traversal) before reaching the LLM/context lookup.

4. **Multilingual Voice Navigation**
   - Built-in `SpeechRecognition` web API allowing hands-free microphone query activation.
   - Automatic routing detection (e.g., mapping "Take me to Zone A" to active layout highlight) with synthetic text-to-speech audio feedback.

---

## 🛠️ Technology Stack

* **Frontend:**
  - [Vite](https://vite.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
  - [Tailwind CSS](https://tailwindcss.com/) for fluid layouts
  - [Playwright](https://playwright.dev/) + [@axe-core/playwright](https://github.com/dequelabs/axe-core-playwright) for automated accessibility audits
  
* **Backend:**
  - [FastAPI](https://fastapi.tiangolo.com/) (Asynchronous Python Web Framework)
  - [ChromaDB](https://www.trychroma.com/) (Local Vector Database)
  - [SentenceTransformers](https://sbert.net/) for semantic embeddings
  - [pytest](https://docs.pytest.org/) for automated endpoint testing

---

## 📁 Repository Structure

```text
ArenaOS/
├── .github/
│   └── workflows/
│       └── quality-assurance.yml   # CI/CD Action (Lints and Tests)
├── backend/
│   ├── database/
│   │   └── connection.py           # ChromaDB vector collection manager & seeding
│   ├── guardrails/
│   │   └── security_filters.py     # Deterministic input validation guardrails
│   ├── tests/
│   │   └── test_endpoints.py       # pytest suite for backend API endpoints
│   ├── main.py                     # FastAPI entry point
│   ├── requirements.txt            # Python dependencies
│   └── .env.example                # Template for environment configuration
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── InteractiveMap.tsx  # Keyboard-navigable SVG Vector Map
│   │   │   └── VoiceAssistant.tsx  # Speech-to-text recording interface
│   │   ├── App.tsx                 # Main React App layout
│   │   ├── index.css               # Main styling rules
│   │   └── main.tsx                # Entry point
│   ├── tests/
│   │   └── accessibility.spec.ts   # Accessibility / WCAG compliance Playwright test
│   ├── package.json                # npm package configuration
│   ├── playwright.config.ts        # Playwright runner configuration
│   ├── tailwind.config.js          # Tailwind CSS settings
│   └── index.html                  # HTML template
├── pyproject.toml                  # Ruff and Python tooling definitions
└── README.md                       # This repository documentation
```

---

## 🏁 Getting Started

### 1. Prerequisites
- Python 3.12+
- Node.js 20.x+
- Git

### 2. Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and set parameters if needed (defaults to `./chroma_db`):
   ```bash
   copy .env.example .env
   ```
5. Run the FastAPI application:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The backend API documentation will be available at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend will be accessible at `http://localhost:5173`.

---

## 🧪 Testing

Both backend and frontend feature automated test suites that run on pull request submissions in GitHub Actions.

### Backend Tests
Ensure your backend virtual environment is active, then run:
```bash
cd backend
pytest tests/
```

### Frontend Tests
Run the Playwright test suite (including accessibility audits):
```bash
cd frontend
# Install Playwright browsers (first-time setup)
npx playwright install --with-deps
# Run tests
npx playwright test
```
To view the generated test report:
```bash
npx playwright show-report
```

---

## 🛡️ Input Security Guardrail Rules

ArenaOS implements pre-processing guardrails to check inputs for the following threats:
* **Instruction Override:** Prevents prompts containing instructions to ignore safety rules.
* **Role Manipulation:** Detects requests attempting to gain unauthorized access levels.
* **Metadata Leakage:** Screens attempts to query system prompt secrets.
* **XSS / HTML Injection:** Blocks script tags and standard DOM events.
* **Path Traversal:** Disallows requests referencing directory traversals (e.g., `../../`).
