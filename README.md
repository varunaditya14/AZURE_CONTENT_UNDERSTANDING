# Azure Content Understanding Demo

A full-stack demo that accepts PDF and image uploads, sends them to **Azure AI Content Understanding**, and displays the extracted fields, confidence scores, and raw JSON response.

---

## Architecture

```
frontend/   React + Vite + TypeScript + Tailwind CSS v4
backend/    FastAPI + Azure AI Content Understanding Python SDK
```

The frontend calls `POST /analyze` on the FastAPI backend. The backend routes the file to the appropriate Azure analyzer and returns structured field data.

---

## Supported file types

| Category | Formats                          | Analyzer used          |
| -------- | -------------------------------- | ---------------------- |
| Document | PDF                              | `ANALYZER_ID_DOCUMENT` |
| Image    | JPEG, PNG, TIFF, BMP, HEIF, WebP | `ANALYZER_ID_IMAGE`    |

> **Extending to audio/video:** Add new MIME type entries to `_ROUTING_TABLE` in `backend/app/routers/analyze.py` and point them at a new `ANALYZER_ID_*` environment variable.

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- An [Azure AI Content Understanding](https://learn.microsoft.com/azure/ai-services/content-understanding/) resource with at least two analyzers created

---

## Backend setup

### 1. Create and activate a virtual environment

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable               | Description                                                  | Required |
| ---------------------- | ------------------------------------------------------------ | -------- |
| `AZURE_CU_ENDPOINT`    | Your Azure Content Understanding resource endpoint URL       | ✅       |
| `AZURE_CU_KEY`         | API key for the resource                                     | ✅       |
| `ANALYZER_ID_DOCUMENT` | Analyzer ID for PDF / document extraction                    | ✅       |
| `ANALYZER_ID_IMAGE`    | Analyzer ID for image extraction                             | ✅       |
| `ALLOWED_ORIGINS`      | Comma-separated list of allowed CORS origins (default: none) | ✅       |

Example `.env`:

```dotenv
AZURE_CU_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_CU_KEY=your_api_key_here
ANALYZER_ID_DOCUMENT=cu_doc_structured_extractor
ANALYZER_ID_IMAGE=cu_image_content_extractor
ALLOWED_ORIGINS=http://localhost:5173
```

### 4. Run the backend

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.  
Swagger docs: `http://localhost:8000/docs`  
Health check: `http://localhost:8000/health`

---

## Frontend setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and set the backend URL:

```bash
cp .env.example .env
```

| Variable            | Description                     | Default                 |
| ------------------- | ------------------------------- | ----------------------- |
| `VITE_API_BASE_URL` | Base URL of the FastAPI backend | `http://localhost:8000` |

### 3. Run in development mode

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Build for production

```bash
npm run build
```

Output is written to `frontend/dist/`.

---

## Running both together (local development)

### Option A — single command (recommended)

From the project root, install the root dev dependencies once:

```bash
npm install
```

Then start both servers with one command:

```bash
npm run dev
```

This uses `concurrently` to run the backend and frontend in parallel in the same terminal, with colour-coded prefixes so you can tell them apart.

| Script                 | What it does                       |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Starts backend + frontend together |
| `npm run dev:backend`  | Starts only the FastAPI backend    |
| `npm run dev:frontend` | Starts only the Vite frontend      |

> **Note:** The backend script uses `.venv\Scripts\uvicorn` directly so the virtual environment does not need to be activated first. Make sure you have created the venv at `backend/.venv` as described above.

### Option B — separate terminals

```bash
# Terminal 1 — backend
cd backend && .venv\Scripts\activate && uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend && npm run dev
```

Navigate to `http://localhost:5173`, upload a PDF or image, and view the extracted results.

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── config.py          # Environment variable loading (pydantic-settings)
│   │   ├── main.py            # FastAPI app, CORS, logging
│   │   ├── models/
│   │   │   └── schemas.py     # Pydantic request/response models
│   │   ├── routers/
│   │   │   └── analyze.py     # POST /analyze endpoint
│   │   └── services/
│   │       └── azure_cu.py    # Azure SDK wrapper, field extraction
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/               # Fetch wrapper
│   │   ├── components/        # UI components
│   │   ├── types/             # TypeScript types matching backend schemas
│   │   └── utils/             # File routing helpers
│   ├── .env.example
│   └── package.json
├── .gitignore
├── package.json       # Root scripts — concurrently runs backend + frontend
└── README.md
```
