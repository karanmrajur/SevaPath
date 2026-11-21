# Document Consistency Check

Open **My Documents → Document Consistency Check** after signing in and unlocking the wallet. Select an image, then **Scan**. The review compares fields against previously confirmed scans as soon as OCR finishes. Confirm that the fields describe you on forms that can name several people. Use **Recheck All Documents** to recompute comparisons from confirmed fields without uploading or rescanning images. Restoring encrypted history recomputes the comparisons automatically.


## Check your own documents locally

1. Open **My Documents → Document Consistency Check**, sign in and unlock the wallet. Choose a temporary session or unlock encrypted OCR history. Use the consistency screen's **Select File** control, which reads the image in the browser. The separate **Upload a document** form explicitly stores the original in your encrypted account wallet.
2. Choose the correct document type and scan the first image. For Aadhaar, use the side that includes the name and date or year of birth. You can redact identifiers, QR codes and unrelated fields while leaving the name and layout anchors readable. Verify the name against the image and confirm the document.
3. Scan the second image in either order. If asked to confirm ownership, check the exact spelling and confirm that the field describes you. If the name is missing, type it in the visible **Full name** input. The same comparison runs after confirmation. To verify persistence, refresh and reopen the wallet and encrypted history.
4. If the expected alert is absent, expand **OCR diagnostics (private)**. Record the document type, script or language, models, OCR status and last stage, name field status, page and name confidence, whether the first record was loaded, comparable name count, whether comparison ran, conflict count and reason. Compare the extracted spelling with the image locally. If reporting the issue, share only the redacted diagnostics and whether a character or matra was missing or changed. Keep the extracted names, original images and identifiers private.

Real-format regression tests use synthetic Aadhaar and income certificate images. The Aadhaar fixture uses unlabelled bilingual names above DOB and gender, a pattern shown in the public UIDAI layout. The income fixture splits the applicant label across lines and includes separately labelled relatives. The browser tests supply synthetic wallet API responses. They do not use live citizen documents. [UIDAI public Aadhaar layout](https://uidai.gov.in/images/tenders/RFP5AadhaarDocument.pdf)

## Recognition

SevaPath serves the Tesseract worker, WebAssembly core, orientation/script data and language models alongside the frontend. Automatic mode detects the dominant script where the image contains enough text. When the script is uncertain or Latin, the fallback recognizer loads English, Hindi and Kannada. Several languages share the same script. The review shows the script observed in the recognized text, likely languages where distinguishable, the models used and the page and field confidence. Use the language picker to run up to four chosen models on a mixed image.

The bundled models are English, Assamese, Bengali, Gujarati, Hindi, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi in Gurmukhi, Sanskrit in Devanagari, Sindhi in Arabic script, Tamil, Telugu and Urdu. The synthetic browser suite covers English, Hindi and Kannada, including mixed English and Indic text. The other installed models are available for selection and need validation on representative document templates. Field extraction understands common printed labels, with broader coverage for English, Hindi and Kannada. Unfamiliar templates, handwriting and low-quality scans may need manual transcription.

Bodo, Dogri, Kashmiri, Konkani, Maithili, Manipuri and Santali have no dedicated model in this build. Transcribe these fields manually in the original script or review output from a compatible script model. JPEG, PNG and WebP are supported. Wallet PDFs use manual transcription. [Tesseract language data](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html)

## Comparison

Exact names use NFC normalization, whitespace cleanup and limited punctuation normalization. Same-script Indic spelling differences are preserved, including vowel signs. English initials, spacing, token order and small grapheme-level edit distances can produce a possible match. The Devanagari, Kannada and Latin comparison uses conservative romanization candidates and a heuristic similarity score. Cross-script and mixed-script results require review. The similarity score is unrelated to eligibility or official identity verification.

A field with OCR line confidence below 75, or without confidence data, is flagged for manual review when compared. Parents and applicants use separate fields. Address components are compared within the same selected address scope. Income is compared only for the same financial year, and certificate dates only when the scans refer to the same physical document.

Unresolved identity field or expiry differences mark the affected documents for review in readiness. Eligibility uses only existing published catalogue rules. A conflicting fact used by a rule stays unknown. Name spelling by itself does not disqualify a citizen. A user-confirmed correction preserves the original OCR evidence and does not change a government record. [UIDAI correction guidance](https://uidai.gov.in/en/updating-data-on-aadhaar)

## Wallet and privacy

The local consistency scanner sends no images, extracted values, translations or decisions to the backend or an external service. The existing consent-based wallet upload and replacement actions store their encrypted files in the normal wallet. Saving a supported wallet image opens the consistency review automatically. Previously uploaded images can be opened with **Check consistency**. Reviewing a saved image reads it back from the citizen's unlocked wallet. A temporary OCR history stays in memory across visits between the wallet and consistency screen, and clears on lock, refresh or leaving the wallet. Encrypted history can be reopened with its separate passphrase. Confirming a rescan preserves previous evidence and makes the new version current. Temporary images and raw OCR output are discarded after processing. Keep the application origin trusted, since unlocked evidence is available in browser memory.

Optional OCR history uses the existing account-scoped, passphrase-encrypted IndexedDB store. It stays on that browser and can be deleted via the consistency screen. New scans are needed to extract missing fields from older English-only records. Existing extracted values and decisions remain accessible without reuploading the original files.

## Files changed for Task 08

- Browser OCR and model packaging: `src/local-ocr.ts`, `src/ocr-models.ts`, `src/ocr-field-labels.ts`, `vite.config.mjs`, `package.json`, `package-lock.json`.
- Matching and wallet review: `src/document-consistency-engine.ts`, `src/document-consistency.tsx`, `src/document-consistency-cards.tsx`, `src/document-consistency.css`, `src/citizen-context.tsx`, `src/citizen-records.tsx`.
- Scheme results: `src/document-scan-engine.ts`, `src/document-scan-results.tsx`.
- Verification and documentation: `tests/document-consistency.test.mjs`, `tests/document-scan-browser.test.mjs`, `OCR.md`.


## Files changed for Task 09

- OCR phases and layout parsing: `src/local-ocr.ts`, `src/document-consistency-engine.ts`, `src/ocr-field-labels.ts`.
- Wallet entry, session carryover, diagnostics and mismatch alerts: `src/citizen-context.tsx`, `src/citizen-records.tsx`, `src/document-consistency.tsx`, `src/document-consistency-cards.tsx`, `src/document-consistency-diagnostics.tsx`.
- Verification and guidance: `tests/document-consistency.test.mjs`, `tests/document-scan-browser.test.mjs`, and `OCR.md`.


## Name mismatch regression

The comparison checks original-script name evidence before an equivalent Roman spelling. Bilingual name values on the same OCR line are parsed separately. Confirmed spellings in the same script are compared strictly. Cross-script or low-confidence readings require review. An incomplete rescan cannot replace a confirmed name and hide its earlier discrepancy. The mismatch card shows both values, source documents, OCR confidence, and highlights differences at the grapheme level. A decision changes only the local review and preserves the source evidence.

Run `npm.cmd run build` and `npm.cmd run test:wallet-mismatch` from `frontend` with Chrome installed and the backend virtual environment available. Set `SEVAPATH_WALLET_TEST_PYTHON` only if the Python interpreter is somewhere else. The test launches the existing FastAPI app with an isolated in-memory database and a temporary wallet key. Both upload orders use real HTTP wallet requests and browser OCR on synthetic images. It saves the UI screenshots to `frontend/test-results/document-mismatch`. The test runner closes the browser and isolated backend afterward.

The affected files are `src/document-consistency-engine.ts`, `src/document-consistency.tsx`, `src/document-consistency-cards.tsx`, `src/document-consistency.css`, `src/local-ocr.ts`, `src/document-scan.tsx`, `tests/document-consistency.test.mjs`, `tests/document-scan-browser.test.mjs`, `tests/wallet-mismatch.integration.test.mjs`, `package.json`, `OCR.md` and the root `.gitignore`.

## Verification commands

Run from the existing frontend directory with the project's Node version and Chrome installed.

~~~powershell
npm.cmd ci
npm.cmd run test:scan
npm.cmd run test:centres
npm.cmd run build
npm.cmd run test:scan-browser
~~~
