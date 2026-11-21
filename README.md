# SevaPath
### AI-Powered Citizen Assistance & Government Service Preparation Platform

**From Confusion to Clarity. From Discovery to Action.**

SevaPath is a citizen-centric, AI-assisted platform designed to simplify how people discover government schemes, understand eligibility requirements, prepare documents, and navigate public services.

Our mission is to make government services more **accessible, understandable, privacy-conscious, and citizen-friendly**.

Rather than functioning as just another scheme directory, SevaPath focuses on helping citizens become **application-ready**.

---

## 1. Problem Statement

India offers numerous Central and State Government schemes and public services. However, citizens often face challenges such as:

- Difficulty discovering relevant schemes and services.
- Confusion about eligibility criteria and application requirements.
- Incomplete, inconsistent, or incorrect documents.
- Repeated visits to government service centres.
- Language and digital-literacy barriers.
- Difficulty understanding grievance procedures.
- Lack of a unified way to organize application preparation.

Even when citizens discover a suitable scheme, they may not know whether their documents are ready or what they should do next.

**The challenge is not only finding a government service. It is successfully preparing to access it.**

---

## 2. Our Solution

SevaPath addresses these challenges through an integrated citizen assistance experience.

The platform combines:

1. Personalized citizen profiles.
2. Government scheme and service discovery.
3. AI-assisted multilingual guidance through JanSetu AI.
4. Privacy-first document scanning using OCR.
5. Cross-document consistency checking.
6. Optional encrypted local document-analysis history.
7. Personalized eligibility and requirement guidance.
8. AI-assisted grievance preparation.
9. Nearby Seva Sindhu service-centre discovery.
10. Document organization and citizen journey tracking.

These features work together to help citizens move from **service discovery to application preparation**.

---

## 3. Key Features

### 3.1 Citizen Dashboard

The dashboard provides a centralized interface for accessing SevaPath's features.

Citizens can navigate between their profile, government schemes, eligibility guidance, document tools, AI assistance, service centres, and preparation journey.

### 3.2 My Profile

Citizens can maintain relevant information such as:

- Personal details.
- Educational background.
- Occupation.
- Residential information.
- Other details relevant to scheme eligibility.

This information supports personalized service discovery and reduces repetitive data entry.

### 3.3 JanSetu AI — Multilingual Citizen Assistant

JanSetu AI helps citizens understand government schemes and services through conversational assistance.

**Capabilities:**

- Government scheme and service guidance.
- Explanation of eligibility conditions.
- Required-document guidance.
- Relevant service search.
- Suggested next steps.
- Multilingual interaction in English, Hindi, and Kannada.
- Browser-supported speech interaction.

**Example question:**

> What documents are required for a student scholarship in Karnataka?

JanSetu AI is intended to make government information easier to understand, particularly for citizens who prefer conversational or voice-based interactions.

Responses are guidance, not official government decisions.

### 3.4 Privacy-First Document OCR

SevaPath includes browser-based Optical Character Recognition (OCR) to help citizens extract information from selected documents.

**Example document types:**

- Aadhaar cards.
- Income certificates.
- Educational marksheets.
- Other supported citizen documents.

For the local OCR workflow, document images are processed in the browser rather than being unnecessarily transmitted to an AI server.

This approach helps reduce exposure of sensitive personal documents.

OCR results may contain errors and should always be reviewed by the citizen.

### 3.5 Cross-Document Consistency Checker

Government applications can encounter problems when information differs across documents.

SevaPath includes document consistency analysis to identify potential discrepancies in extracted information.

**Example:**

Document A: रामाधर

Document B: रामाधार

The system is designed to flag such differences for citizen review.

This feature supports early detection of possible document issues. It does not authenticate documents or replace official verification.

### 3.6 Privacy and Local Encryption

SevaPath follows a privacy-conscious design for document analysis.

The optional saved document-consistency history supports:

- Local browser storage.
- Passphrase-based protection.
- AES-256-GCM authenticated encryption.
- Reduced dependence on server-side storage for OCR history.

Encrypted history is distinct from the general application database. Not every type of application data should be assumed to use the same encryption workflow.

### 3.7 Government Scheme and Service Discovery

SevaPath includes a structured catalogue of selected Karnataka and Central Government schemes and services.

Citizens can explore information about:

- Scholarships.
- Certificates.
- Social welfare schemes.
- Pensions.
- Other public services.

Where available, catalogue entries provide eligibility requirements, document requirements, application guidance, and official source references.

### 3.8 Personalized Eligibility Checker

The eligibility checker compares available citizen information against known scheme requirements.

It helps users understand:

- Possible eligibility.
- Relevant eligibility conditions.
- Missing information.
- Required supporting documents.
- Preparation steps before applying.

**Important:** SevaPath provides preliminary eligibility guidance. Final eligibility and approval remain with the relevant government authority.

### 3.9 AI Grievance Copilot

The Grievance Copilot assists citizens in preparing service-related complaints.

Example situations include:

- Delayed certificate applications.
- Missing application updates.
- Document-related issues.
- Difficulties accessing public services.

The copilot helps structure grievance information and prepare a clear complaint draft.

Where applicable, citizens can be guided toward official grievance channels.

SevaPath does not claim to submit or resolve grievances automatically without an authorized government integration.

### 3.10 Nearby Seva Sindhu Centres

SevaPath helps citizens locate relevant Seva Sindhu service centres for in-person assistance.

Depending on the available locator information, citizens can:

- Search by location or area.
- Explore service-centre details.
- View locations on a map.
- Open directions.

This connects digital preparation with physical government service access.

### 3.11 Document Wallet

The document wallet provides a convenient place for citizens to organize supported document information and access document-related tools.

It complements the OCR and consistency-checking workflows.

SevaPath's document wallet is not presented as a replacement for DigiLocker or as an official government document-verification service.

### 3.12 My Journey — Citizen Preparation Tracking

My Journey helps citizens organize their progress toward accessing a government service.

The experience is designed around:

- Preparation progress.
- Pending requirements.
- Missing documents.
- Recommended next steps.
- A clearer view of the citizen's service journey.

This shifts the experience from simply finding a scheme to understanding what needs to happen next.

---

## 4. Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| React | Component-based user interface |
| TypeScript | Type-safe frontend development |
| Vite | Fast development and build tooling |
| CSS | Responsive styling and layout |
| Browser OCR tooling | Local document text extraction |
| Browser Speech APIs | Supported voice interactions |
| Web Crypto API | Browser-based cryptographic operations |
| IndexedDB | Optional local data storage |

### Backend

| Technology | Purpose |
|---|---|
| Python | Backend development |
| FastAPI | REST API framework |
| SQLAlchemy | Database interaction |
| Alembic | Database schema migrations |
| SQLite | Lightweight development database |
| PostgreSQL | Supported relational database option |
| Pytest | Backend automated testing |

### Development Tools

- Visual Studio Code.
- Git and GitHub.
- Node.js and npm.
- Python development environment.

---

## 5. System Architecture

SevaPath follows a frontend-backend architecture with selected privacy-sensitive operations performed locally in the browser.

```text
                    CITIZEN
                       |
                       v
             SEVAPATH FRONTEND
             React + TypeScript
                       |
         +-------------+-------------+
         |                           |
         v                           v
   BROWSER FEATURES             REST API CALLS
         |                           |
   +-----+------+                    v
   |            |              FASTAPI BACKEND
   v            v                    |
 Local OCR   Local Storage     +-----+------+
   |        & Encryption       |            |
   v                           v            v
 Document                  Scheme Search  Application
 Comparison                & Guidance     Logic
                                  |
                                  v
                           DATABASE LAYER
                            SQLAlchemy
                                  |
                                  v
                           Scheme Catalogue
                           & Application Data
```

### Architecture Principles

**Separation of concerns:** The frontend handles citizen interaction, while the backend manages API operations, catalogue access, and supported application logic.

**Privacy-first processing:** Supported OCR operations are performed locally in the browser.

**Modularity:** Features are organized into separate frontend components, engines, and backend modules.

**Extensibility:** The architecture can be expanded with additional government services and authorized integrations.

---

## 6. Government Scheme Dataset

SevaPath's initial dataset is a curated catalogue of selected Karnataka and Central Government schemes and citizen services.

The catalogue is structured to support service discovery and requirement-based guidance.

### Dataset Implementation

| File | Purpose |
|---|---|
| `backend/app/db/catalogue_task04.json` | Structured government scheme and service catalogue |
| `backend/app/db/catalogue_seed.py` | Database catalogue seeding |
| `DATA_SOURCES_AUDIT.md` | Source and provenance documentation |

### Data Approach

- Collect publicly available scheme and service information.
- Prefer official government sources.
- Structure relevant eligibility and document requirements.
- Preserve source references where available.
- Load catalogue records through the database seeding process.

The initial catalogue is limited in scope and should not be treated as a complete or real-time government scheme database.

Official sources should be consulted for current requirements, deadlines, and application procedures.

---

## 7. How SevaPath Differs from UMANG and myScheme

SevaPath is designed to complement existing government platforms rather than replace them.

| Platform | Primary Focus |
|---|---|
| **UMANG** | Access to integrated government services |
| **myScheme** | Government scheme discovery and eligibility exploration |
| **SevaPath** | Citizen preparation, document intelligence, and guided next steps |

UMANG and myScheme already offer important capabilities, including service discovery, eligibility information, and digital assistance.

SevaPath's proposed differentiation is the combination of:

- Browser-based document OCR.
- Cross-document consistency analysis.
- Missing-requirement guidance.
- Privacy-conscious local document processing.
- AI-assisted citizen support.
- Grievance preparation.
- Connected citizen journey tracking.

### Our Core Differentiation

**UMANG provides service access.**

**myScheme provides scheme discovery.**

**SevaPath focuses on application readiness.**

---

## 8. Example Citizen Journey

Consider a student in Karnataka searching for a scholarship.

### Step 1 — Create a Citizen Profile

The student enters relevant personal and educational details.

### Step 2 — Discover a Scholarship

SevaPath helps the student explore potentially relevant scholarship schemes.

### Step 3 — Understand Eligibility

The eligibility checker explains known requirements and identifies information that may be missing.

### Step 4 — Prepare Documents

The student uses the document tools to extract information from supported certificates.

### Step 5 — Review Document Consistency

SevaPath checks supported fields for potential inconsistencies and presents them for review.

### Step 6 — Ask JanSetu AI

The student asks questions about required documents and preparation steps.

### Step 7 — Find Assistance

If needed, the student searches for a relevant Seva Sindhu centre.

### Step 8 — Track Preparation

My Journey helps the student review pending requirements and next steps.

### Step 9 — Apply Through Official Channels

The student proceeds to the relevant official application platform.

SevaPath assists with preparation; it does not replace the government authority responsible for processing the application.

---

## 9. Project Structure

The repository is organized into frontend and backend applications, along with documentation and tests.

```text
SevaPath/
|
|-- frontend/
|   |-- package.json
|   |-- src/
|   |   |-- citizen-layout.tsx
|   |   |-- citizen-discovery.tsx
|   |   |-- citizen-records.tsx
|   |   |-- document-scan-engine.ts
|   |   |-- document-consistency-engine.ts
|   |   |-- document-consistency.tsx
|   |   |-- citizen-preparation.tsx
|   |   |-- citizen-preparation-engine.ts
|   |   |-- grievance-copilot.tsx
|   |   |-- jansetu-results.tsx
|   |   `-- ...
|   |
|   `-- tests/
|
|-- backend/
|   |-- app/
|   |   |-- core/
|   |   |   `-- jansetu_search.py
|   |   |
|   |   `-- db/
|   |       |-- catalogue_task04.json
|   |       `-- catalogue_seed.py
|   |
|   `-- tests/
|       `-- test_jansetu.py
|
|-- DATA_SOURCES_AUDIT.md
|-- CITIZEN_PREPARATION.md
`-- README.md
```

This is an illustrative view of the main modules, not an exhaustive listing of every repository file.

---

## 10. Getting Started

### Prerequisites

Install:

- Git
- Node.js and npm
- Python
- A modern browser
- Visual Studio Code or another code editor

### Clone the Repository

```bash
git clone https://github.com/INNOVEX-26/SevaPath.git
cd SevaPath
```

### Frontend Setup

Open a terminal in the frontend directory:

```bash
cd frontend
npm install
npm run dev
```

Vite will display the local development URL in the terminal.

### Backend Setup

Open a separate terminal in the backend directory:

```bash
cd backend
```

Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install backend dependencies using the dependency file or project configuration included in the repository.

Configure any required environment variables using the project's provided example configuration.

Start the FastAPI application using the module path defined by the backend entry point.

For example, if the application object is `app` in `app/main.py`:

```bash
uvicorn app.main:app --reload
```

The backend entry point, dependency installation method, environment variables, and database initialization steps should be confirmed against the current repository before deployment.

### Database Initialization

Follow the backend database configuration and migration instructions included in the project.

The curated scheme catalogue is maintained in:

```text
backend/app/db/catalogue_task04.json
```

The associated seeding logic is located in:

```text
backend/app/db/catalogue_seed.py
```

---

## 11. Testing

SevaPath includes automated tests for selected backend and frontend features.

Examples include:

```text
backend/tests/test_jansetu.py

frontend/tests/citizen-preparation.test.mjs

frontend/tests/wallet-mismatch.integration.test.mjs
```

The frontend tests can be run using the test commands configured in `frontend/package.json`.

Backend tests can be run using the configured Python testing environment.

Testing areas include:

- JanSetu search and guidance logic.
- Citizen preparation calculations.
- Document consistency workflows.
- Frontend integration behavior.

Automated tests do not replace real-browser verification, particularly for OCR accuracy, microphone permissions, encryption workflows, and map interactions.

---

## 12. Security and Privacy

SevaPath is designed with the following privacy principles:

### Local Processing

Supported OCR operations process document images in the browser to reduce unnecessary transmission.

### Encrypted Local History

Optional document-analysis history supports passphrase-protected encryption using AES-256-GCM.

### Data Minimization

The platform aims to use only the information needed for the relevant citizen assistance workflow.

### User Review

Extracted document fields and eligibility suggestions are guidance and should be reviewed by the citizen.

### No Official Document Authentication

SevaPath does not claim that OCR output proves the authenticity of a government document.

### Prototype Security Scope

The platform is a hackathon prototype. Production use involving sensitive citizen data would require additional security review, deployment hardening, access controls, and privacy compliance assessment.

**Do not upload real identity documents or confidential personal information when evaluating a publicly accessible demonstration environment. Use synthetic test data.**

---

## 13. Current Scope and Limitations

SevaPath is an evolving prototype.

Current limitations include:

- An initial, limited scheme and service catalogue.
- Scheme information that may require manual updates.
- OCR accuracy that depends on document quality and language.
- Potential errors in extracted or compared document fields.
- Browser-dependent voice capabilities.
- Preliminary eligibility guidance rather than official approval.
- Grievance drafting rather than guaranteed government submission.
- No implied integration with protected government systems.
- Service-centre information that may require independent verification.

These limitations guide our development priorities.

---

## 14. Future Enhancements

### Verified Government Data Integrations

Expand scheme coverage and integrate authorized official data sources where available.

### Improved Multilingual Intelligence

Strengthen Hindi, Kannada, and other Indian-language support for citizen assistance and document understanding.

### Advanced Document Readiness

Improve OCR field extraction, consistency analysis, and missing-document identification.

### Citizen Preparation Planner

Provide clearer document dependency planning and personalized action sequences.

### Better Accessibility

Expand voice-first navigation and accessible interfaces for users with varying digital literacy.

### Official Service Integrations

Explore authorized integrations for application status, grievance tracking, and government service workflows.

### Wider Geographic Coverage

Expand beyond the initial Karnataka-focused catalogue to support more states and regions.

---

## 15. Responsible Use and Disclaimer

SevaPath is an independent hackathon project developed for citizen assistance and educational demonstration.

It is **not an official Government of India or Government of Karnataka platform**.

SevaPath is not affiliated with, endorsed by, or a replacement for UMANG, myScheme, DigiLocker, Seva Sindhu, or other official government platforms.

Scheme information, eligibility guidance, OCR results, and AI-generated assistance may be incomplete or inaccurate.

Users should verify requirements and submit applications through the appropriate official government websites or authorized service centres.

---

## 16. Official Government References

The following platforms are useful official references for government services and schemes:

- **UMANG:** https://web.umang.gov.in/
- **myScheme:** https://www.myscheme.gov.in/
- **Seva Sindhu:** https://sevasindhu.karnataka.gov.in/
- **DigiLocker:** https://www.digilocker.gov.in/
- **National Portal of India:** https://www.india.gov.in/

For the specific sources used in the curated dataset, refer to `DATA_SOURCES_AUDIT.md`.

---

## 17. Repository

**GitHub:** https://github.com/INNOVEX-26/SevaPath

This repository contains the source code, development modules, tests, and supporting documentation for the SevaPath prototype.

---

## 18. Project Vision

We envision a future where citizens do not have to struggle through multiple portals, confusing eligibility requirements, and incomplete documentation before accessing government services.

SevaPath aims to make the preparation process clearer, more inclusive, and more manageable.

Our long-term goal is to build an intelligent citizen assistance layer that complements India's existing digital public infrastructure.

---

## SevaPath — From Confusion to Clarity. From Discovery to Action.

**Discover smarter. Prepare better. Access with confidence.**
