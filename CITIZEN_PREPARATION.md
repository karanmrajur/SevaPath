# SevaPath citizen preparation

The Document Wallet and its Consistency Check share the Pre-Rejection Shield, Benefit Radar and Eligibility Passport. Sign in, unlock the wallet and open either a temporary consistency session or passphrase-encrypted history. Use **Select File** inside Consistency Check for a local-only scan. The separate vault upload is available for files you explicitly choose to store on the SevaPath server.

## Local startup

Run these in separate PowerShell terminals from the existing repository. The first command group assumes the existing virtual environment and frontend dependencies are installed.

```powershell
Set-Location 'C:/Users/sdram/OneDrive/Desktop/SevaPath/SevaPath/backend'
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
Set-Location 'C:/Users/sdram/OneDrive/Desktop/SevaPath/SevaPath/frontend'
npm.cmd run dev
```

Open [SevaPath](http://127.0.0.1:5173). For a new local database, run `python -m alembic upgrade head` and `python -m app.db.seed` through the existing virtual environment before starting. Task 07 requires no new migration or environment variable. Optional voice provider configuration and the browser speech privacy choices are in [JANSETU.md](JANSETU.md). The existing optional `VITE_MAPTILER_BROWSER_KEY` enables embedded satellite tiles. Road maps and Google Maps links still work with the existing map provider and fallback configuration.

## Evidence, eligibility and offline use

- OCR is performed by the app’s browser worker. Readings and citizen decisions stay local during a local-only scan. Conflicts remain visible with original evidence after a citizen has recorded a review decision.
- Verified rule and checklist rows come from the existing checked official references in the catalogue. Conditional requirements remain conditional. SSP guidance applies to specific awards, and the catalogue has no confirmed current SSP deadline or machine-readable rules for it. Follow the checked Karnataka technical education publication and consult the award’s current official instructions.
- A readiness percentage divides matched, unconditional, required document items by the total in that category. Preparation progress counts the citizen's three general checklist steps. Individual sourced prerequisites are tracked separately. Both measures describe personal preparation.
- Optional saved local history encrypts checklist progress and family role and age entries with the wallet’s separate consistency passphrase. The optional profile toggle uses the supported account facts already available in the browser. Family entries do not inherit those facts or any wallet scans.
- An open, unlocked tab can use previously cached public catalogue responses if connectivity fails. OCR needs worker and model assets available on the device. An offline launch, sign-in or wallet unlock still needs the existing online application and authentication flow. Download the public checklist for use outside the app. It contains public requirements and source links.
- Certificate reminders appear inside the unlocked Passport and use recorded dates. An absent or ambiguous date still requires manual verification. This release has no background reminder, family document sharing or official identity verification.
- The Grievance Copilot builds a local, editable template in English, Hindi or Kannada. Department suggestions come from the service you select. The existing CPGRAMS link opens the official channel separately. Review the appropriate authority and submit manually.
- The centre locator uses its existing government-directory data and coordinate provenance. Distances require available coordinates. Centres can help with some services, so confirm availability before visiting. Location remains in the locator page. Opening directions shares the origin with Google Maps.

## Three-minute demonstration

| Time | What to show and say |
| --- | --- |
| 0:00–0:20 | Sign in as a synthetic citizen, unlock the Wallet and open Consistency Check with encrypted history. Say, “Scans selected here are read in this browser. I’m using synthetic images today.” |
| 0:20–0:55 | Scan the synthetic Aadhaar marked रामाधर, verify the applicant checkbox and confirm it. Scan the synthetic income certificate marked रामाधार. Point to the mismatch and the highlighted ध and धा. Confirm the second document, then choose the Aadhaar value for this local review. Expand the evidence to show both readings are preserved. Have both confirmed synthetic scans available in encrypted history if OCR takes longer during the live demonstration. |
| 0:55–1:20 | Ask JanSetu, “I am a Karnataka student. My father is a farmer. I need financial help for college.” Open the SSP result and its private action plan. Say, “JanSetu uses the catalogue to suggest actual programmes. The sponsoring department determines eligibility.” |
| 1:20–2:00 | Select Student and scholarships in Benefit Radar and show SSP’s conditional income, caste and previous marks card requirements. Expand the dependency for Income Certificate, open the checked information link, and mark a preparation step. Point out the distinction between missing requirements, review needs and preparation progress. Download the public checklist. |
| 2:00–2:30 | Open Eligibility Passport. Show the certificate expiry status and adjust the reminder window. Explain that saved family roles require consent and do not inherit wallet scans. Lock the consistency history and reopen it with the passphrase to show the preserved review and plan. |
| 2:30–3:00 | Select Find nearby service centres, then choose Use My Location or search by PIN. Show directions and the published listing source. Close with, “SevaPath shows what I can prepare locally, what I still need to confirm and where I can take the next step.” |
