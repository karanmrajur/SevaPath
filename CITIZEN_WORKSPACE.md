# SevaPath citizen workspace

## Run locally

Use the existing backend virtual environment and frontend directory. From `backend` in PowerShell:

```powershell
& ./.venv/Scripts/python.exe -m pip install -r requirements.txt
& ./.venv/Scripts/python.exe -m alembic upgrade head
& ./.venv/Scripts/python.exe -m app.db.seed
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

From `frontend` in a second terminal:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Use the same hostname for Vite and FastAPI. The Vite development proxy forwards `/api` to FastAPI.

## Wallet configuration

Set `WALLET_ENCRYPTION_KEY` in the backend service environment or in the ignored `backend/.env` file. It is a randomly generated, base64-encoded 32-byte AES key. For local development, generate one with `python -c "import secrets; print(secrets.token_urlsafe(32) + '=')"` and store it through your local configuration. Preserve the key separately from database backups. Existing encrypted records require that key to be read. Key rotation is outside this implementation.

New files, profile photos and sensitive optional profile fields require the configured key. Files are encrypted with AES-256-GCM using a fresh nonce and an account-and-file-specific authentication context. Sensitive optional profile values are kept in an encrypted part of the account record. Basic profile properties, account sign-in details, file metadata and preparation records remain in the private database.

Revision `0004` preserves existing records and marks older files as legacy. After setting the key, run `python -m app.db.encrypt_wallet` from the backend to encrypt any existing file payloads. This command is safe to rerun. Older backups and freed database pages follow the deployment storage and retention policy. Keep these copies protected. Use HTTPS and set `SESSION_COOKIE_SECURE=true` in a hosted deployment.

The wallet uses the account password unless the citizen sets an MPIN. Credential hashes use scrypt. Five failed unlock attempts lock the wallet for 15 minutes. An unlock is tied to one authenticated session and lasts at most five minutes. File requests require both the unlock and account ownership. Changing the MPIN clears existing grants. Changing the account password revokes all authenticated sessions. Deleting an account removes active private records and uploads. The personal-data export returns JSON records and file metadata. Use the wallet to download individual files.

## External services and verified data

The service directory reuses the 32 existing catalogue records. It can explain configured conditions and match required document categories with self-reported uploads. Government agencies determine eligibility, document acceptance and application outcomes. The [catalogue source audit](DATA_SOURCES_AUDIT.md) documents the coverage.

The Help Centre prepares a draft with a link to the user's email application. Document reminders appear in the unlocked wallet. Email or SMS delivery, government application submission and government verification have no configured integration.

## Private sequential document scans

Open **My Documents → Scan documents privately** from the signed-in dashboard. Scan one JPEG, PNG, or WebP at a time, correct the editable fields, and confirm each scan. OCR uses English recognition and browser-hosted Tesseract.js assets. The worker, WebAssembly core, and language model are served with the frontend build. Neither the files nor the extracted values are sent to a server. The scan session holds only confirmed document types and the few usable facts shown in the review. Full OCR text is discarded after extraction. Scans clear on page exit or refresh and are separate from the existing wallet upload flow. [Tesseract.js local installation reference](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)

The scan catalogue is available at read-only `GET /api/services/scan-catalogue`. It supplies the existing verified rules and document mappings. The browser derives age from a labelled date of birth, uses confirmed answers for the sourced landholding and household-head checks, and compares expiry dates where applicable. Unsupported, conflicting and missing facts stay unknown. The readiness denominator is the number of verified unconditional document items for that service. A scan with a recorded past expiry does not match. Confirming OCR indicates citizen review, and government authorities determine document acceptance and eligibility.

Use `npm.cmd run test:scan` for the extraction and assessment tests. For the real OCR and network regression, build first and run `npm.cmd run test:scan-browser` with Google Chrome installed. The test generates synthetic images, intercepts network traffic, and uses an isolated Vite preview. Production OCR requires no extra configuration or database migration.


## Document Consistency Check

Start both servers using the commands above. In the dashboard, open **My Documents → Document Consistency Check** and unlock the wallet. Use a temporary session or create encrypted history with a separate, strong passphrase. A temporary session clears when you leave the page. To reopen saved history, unlock the wallet and enter the same consistency passphrase on the same browser and site. Use **Delete saved consistency data** to remove it, even if you forgot the consistency passphrase. HTTPS or localhost is required for browser encryption.

Scan an image and check the subject, extracted fields and earlier values. For documents with several people, the scanner looks for applicant labels and explicit bank holder or landowner names. Confirm these values describe you before comparing them. Enter anything else manually from your own row or role. Confirming a scan adds an independent source. Comparisons use normalized text, dates and postal components, with tentative suggestions for initials, spelling, name order and common Kannada, Hindi and Latin name forms. Low OCR line confidence requires a check. Income amounts are compared for the same reported financial year. Issue and expiry dates are compared for scans explicitly grouped as the same physical document.

Keep the original extraction and the decision side by side in review history. Choosing a source or entering a corrected value supplies a user-reviewed fact. Choosing both or deferring leaves the field unresolved. The public catalogue is read-only, and the browser reassesses only its published eligibility and document checks. A conflicting age-related fact stays unknown pending review, even when the two dates calculate to the same age. Conflicting expiry values for the same physical document require review before that document can count toward readiness. Compare official records with the issuing authority. [UIDAI update guidance](https://uidai.gov.in/en/updating-data-on-aadhaar)

Saved history stores limited labelled evidence, reviewed values and decision history as AES-256-GCM ciphertext in IndexedDB, scoped to the unlocked account. PBKDF2 derives the key in the browser from the separate passphrase and a random salt. The key stays in memory. Only the authenticated wallet scope and public catalogue are obtained from the backend. Images, full OCR text, extracted fields, decisions and the consistency passphrase stay on the device. Saved history is specific to this site and browser and is separate from the cloud wallet and account export. Delete it from that device before removing the account if you want to remove the local copy. There is no database migration or new environment variable for this feature. [Web Crypto reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

OCR uses the existing English model and single-line labels. Users can enter Kannada and Hindi names themselves for tentative transliteration comparison. The check supports JPEG, PNG and WebP, and each saved history can hold up to 40 scans. Run `npm.cmd run test:scan` for synthetic comparison, encryption and eligibility tests. Run `npm.cmd run build` and then `npm.cmd run test:scan-browser` with Chrome installed for the isolated browser tests.


### Consistency implementation files

- Backend: `backend/app/routers/citizen.py` adds the local account scope to the signed-in, unlocked wallet response. `backend/tests/test_secure_workspace.py` covers the authentication and wallet boundary.
- Frontend: `frontend/src/document-consistency.tsx`, `document-consistency-cards.tsx`, `document-consistency-engine.ts`, `document-consistency-storage.ts`, and `document-consistency.css` implement the review flow. `citizen-entry.tsx`, `citizen-records.tsx`, `citizen-api.ts`, `local-ocr.ts`, `document-scan.tsx`, `document-scan-engine.ts`, and `document-scan-results.tsx` connect the existing navigation, wallet, OCR and eligibility checks.
- Tests and setup: `frontend/tests/document-consistency.test.mjs`, `frontend/tests/document-scan-browser.test.mjs`, `frontend/package.json`, `frontend/tsconfig.json`, and this guide.

## Task 06 centre locator

The locator uses the public listing endpoint called by the official Seva Sindhu directory. It refreshes Bangalore One, Karnataka One and Grama One listings for Madikeri, Somvarpet, and Virajpet. The five requests are cached per backend worker for six hours after a successful refresh. Failed or partial refreshes keep the last available records and can retry after ten minutes. Use `CENTRE_DIRECTORY_LIVE=false` to run entirely from the bundled snapshot. The checked snapshot contains 284 unique listings after combining the official feed with district supplements. Each record stores its government source and the date it was checked. These sources document listings and may not reflect today's staffing, hours or service availability. [Official Seva Sindhu directory](https://sevasindhu.karnataka.gov.in/Sevasindhu/Servicecenters), [Dharwad district](https://dharwad.nic.in/en/service/pay-your-bills/), [Kodagu district](https://kodagu.nic.in/en/seva-sindhu-kendra/), [Bengaluru Urban district](https://bengaluruurban.nic.in/en/service/seva-sindhu/), [Kalaburagi district](https://kalaburagi.nic.in/en/service/nada-kacheri/)

The tested feed groups supplied no usable coordinates. The starter coordinate crosswalk covers four Bengaluru sites. Jayanagar and Vyalikaval use coordinates in BBMP records for the same address. HSR Layout and Basaveshwaranagar use address-matched OpenStreetMap sites. The API keeps the listing source separate from the coordinate source and confidence, and invalidates a matched pin when its listing address changes. Radius search uses only mapped sites. Manual search includes listings without coordinates. The statewide KSRSAC Grama One GIS catalogue was identified, but its download could not be verified because access was blocked. [BBMP Jayanagar](https://site.bbmp.gov.in/PDF/Election/South1/AC_173_Jayanagar.pdf), [BBMP Malleshwaram](https://site.bbmp.gov.in/PDF/Election/North1/157-Malleshwaram%20LAC.pdf), [OpenStreetMap HSR Layout](https://www.openstreetmap.org/node/1279246451), [OpenStreetMap Basaveshwaranagar](https://www.openstreetmap.org/way/404739433), [KSRSAC dataset catalogue](https://data.opencity.in/dataset/grama-one-centres-in-karnataka-and-bengaluru)

### Maps and environment

1. The Leaflet road map and external Google Maps links work without a key. Road tiles use the OpenStreetMap standard tile service with attribution. Production operators should evaluate its usage limits and choose a suitable tile provider for their traffic. [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/), [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
2. To enable embedded satellite imagery, create a MapTiler Cloud key. Restrict it to your deployed site hostname under Allowed HTTP origins. Use a separate development key for `127.0.0.1`. Set `VITE_MAPTILER_BROWSER_KEY` in the frontend environment, then restart Vite or rebuild. Select a MapTiler plan that covers your usage. The value is a browser credential. Keep private server keys and service tokens out of all `VITE_` variables. [MapTiler key setup](https://docs.maptiler.com/guides/developer/credentials/api-key/), [Satellite tiles API](https://docs.maptiler.com/cloud/api/tiles/)
3. Google Cloud setup is only relevant to the older optional `POST /api/citizen/centres/coordinates` endpoint. If you use it, enable Geocoding API and billing in Google Cloud, restrict the key to that API and your server egress IP, and configure `MAPS_GEOCODING_SERVER_KEY` on the backend. The current locator renders its own sourced coordinates and does not use this endpoint. [Google Geocoding setup](https://developers.google.com/maps/documentation/geocoding/get-api-key-v4)

Request device location through Use My Location or Near Me. The locator holds the fix and accuracy in page memory and calculates straight-line distance locally. It sends no device coordinates to SevaPath's API. Tile providers receive viewport requests. Selecting Directions shares the precise origin with Google Maps and opens driving or walking routing where available. Use HTTPS for deployed geolocation.

### API and files

- `GET /api/citizen/centres` keeps its authentication and existing fields. It adds dataset status and mapped count, plus centre type, search aliases, verification date and separate coordinate provenance on each listing. No database migration is required.
- Created `backend/app/db/centre_directory.py`, `backend/app/db/centre_snapshot.json`, `backend/app/db/centre_coordinates.json`, `backend/tests/test_centre_directory.py`, `frontend/src/centre-locator.ts`, `frontend/src/centre-locator.css`, `frontend/src/centre-map.tsx`, and `frontend/tests/centre-locator.test.mjs`.
- Updated `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/routers/centres.py`, `backend/tests/test_secure_workspace.py`, `backend/.env.example`, `frontend/src/citizen-api.ts`, `frontend/src/citizen-centres.tsx`, `frontend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, and this guide.
- To refresh the offline fallback, run `python -m app.db.centre_directory` from the backend. It replaces the bundled snapshot only when all five upstream groups succeed. Keep coordinates in the separate crosswalk and confirm every added site's address against its official listing.

## Task 05 files

Created:

- `CITIZEN_WORKSPACE.md`
- `backend/alembic/versions/0004_secure_citizen_wallet.py`
- `backend/app/core/wallet.py`
- `backend/app/db/encrypt_wallet.py`
- `backend/app/routers/centres.py`
- `backend/tests/test_secure_workspace.py`
- `frontend/src/citizen-centres.tsx`
- `frontend/src/citizen-help.tsx`
- `frontend/src/citizen-journey.tsx`
- `frontend/src/citizen-profile.tsx`
- `frontend/src/citizen-settings.tsx`
- `frontend/src/citizen-wallet.tsx`

Modified:

- `backend/.env.example`, `backend/requirements.txt`
- `backend/app/core/config.py`, `backend/app/db/citizen_models.py`, `backend/app/main.py`
- `backend/app/routers/catalog.py`, `backend/app/routers/citizen.py`, `backend/app/schemas/citizen.py`
- `backend/tests/conftest.py`, `backend/tests/test_catalogue_task04.py`, `backend/tests/test_citizen.py`
- `frontend/.env.example`
- `frontend/src/catalog.tsx`, `frontend/src/citizen-api.ts`, `frontend/src/citizen-assistant.tsx`, `frontend/src/citizen-context.tsx`
- `frontend/src/citizen-discovery.tsx`, `frontend/src/citizen-entry.tsx`, `frontend/src/citizen-home.tsx`, `frontend/src/citizen-layout.tsx`
- `frontend/src/citizen-records.tsx`, `frontend/src/citizen-support.tsx`, `frontend/src/citizen.css`
- `frontend/src/landing.tsx`, `frontend/src/use-api.ts`

A local encryption key was generated in the ignored `backend/.env` file. The key is separate from the application source and is needed to read data encrypted by this installation.

The local SQLite database was upgraded to revision `0004`. Its 32 catalogue records and existing citizen account were preserved.
