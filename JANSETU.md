# JanSetu voice assistant

Open **AI Voice Assistant** in the authenticated SevaPath dashboard. The public assistant remains available for catalogue browsing. JanSetu uses the existing 32-record catalogue and its rules, documents, prerequisites, government links, source check dates and centre directory. No database migration is needed.

## Run the existing project

Use PowerShell from the existing project folder. In a backend terminal:

~~~powershell
cd backend
& ./.venv/Scripts/python.exe -m pip install -r requirements.txt
& ./.venv/Scripts/python.exe -m alembic upgrade head
& ./.venv/Scripts/python.exe -m app.db.seed
& ./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
~~~

In a frontend terminal:

~~~powershell
cd frontend
npm.cmd ci
npm.cmd run dev
~~~

Open **http://127.0.0.1:5173/dashboard/assistant**, sign in, and select a language. Use the same frontend hostname throughout so the wallet cookies work. For deployment use HTTPS and the existing secure session settings.

## Configure a real provider

Set the following on the **backend**, through its environment or its ignored `backend/.env` file, then restart FastAPI. The base URLs are provider API roots, commonly ending in `/v1`. Use HTTPS for a remote endpoint. Loopback HTTP supports local inference. Start the local model independently. The optional cloud key is required for remote endpoints and kept on the backend.

| Variable | Purpose |
| --- | --- |
| `JANSETU_AI_BASE_URL` | OpenAI-compatible chat API root. The adapter calls `/chat/completions` using JSON-schema routing with JSON-object fallback. |
| `JANSETU_AI_MODEL` | Exact model name or server alias. Choose a model tested in English, Hindi and Kannada for the intended deployment. |
| `JANSETU_AI_API_KEY` | Provider credential, optional for loopback. |
| `JANSETU_AI_GENERAL` | Set to `true` to allow scoped general educational answers. Defaults to false. |
| `JANSETU_SPEECH_BASE_URL` | Optional speech API root implementing `/audio/transcriptions`. |
| `JANSETU_SPEECH_MODEL` | Transcription model name. |
| `JANSETU_SPEECH_API_KEY` | Speech provider credential, optional for loopback. |
| `JANSETU_SPEECH_LANGUAGES` | Space-separated locales the configured transcription model actually supports, such as `en-IN hi-IN kn-IN`. |

From the repository root, start the verification model if the local artifacts are present.

~~~powershell
& ./.jansetu-local/llama/llama-server.exe --model ./.jansetu-local/qwen2.5-0.5b-instruct-q4_k_m.gguf --alias qwen-jansetu-test --host 127.0.0.1 --port 8097 --threads 5 --ctx-size 4096 --no-webui --log-disable
~~~

In the backend terminal, set these values before starting FastAPI:

~~~powershell
$env:JANSETU_AI_BASE_URL = 'http://127.0.0.1:8097/v1'
$env:JANSETU_AI_MODEL = 'qwen-jansetu-test'
$env:JANSETU_AI_GENERAL = 'false'
~~~

Users opt in to model processing from **Language and privacy**. Without a configuration the page says setup is required. During outages and when consent is off, catalogue mode still provides sources and context-aware search.

## Architecture and privacy

- `GET /api/citizen/assistant/status` reports configured chat and speech capability.
- `POST /api/citizen/assistant/chat` accepts the latest question, language, consent and a small public catalogue context. The search uses exact aliases, Unicode normalization, multilingual concepts, transliterated variants, fuzzy token similarity and state/category filters. With consent, the model can identify intent and nominate catalogue entries within the server-supplied shortlist. The backend validates those choices. Government facts, citations, deadlines and application links come from SevaPath’s database, and the original published wording is displayed. General generation, when enabled, is limited to a separate educational response. No submission or government-account access is performed.
- `POST /api/citizen/assistant/checks` requires explicit consent. Profile checks apply the existing verified rule evaluator. Unknown, absent or incomplete rules remain potentially eligible. The wallet check requires an active unlock and reads only account-specific inventory categories and expiry dates. Readiness divides available required items by sourced required items. Uploaded category metadata is a preparation signal, while government authorities decide acceptance.
- For OCR outcomes, use **Share summary with JanSetu** in the unlocked Document Consistency Check. The wallet runs the existing checks on-device and shares just scheme outcomes and a match/difference/unknown result in tab memory. Private reports, files and OCR evidence are excluded from model and speech requests. The shared result clears on wallet lock, logout or tab refresh and can be removed from JanSetu. The assistant never opens the encrypted OCR store.
- Requests are authenticated, origin-checked, size-limited and rate-limited per account per server worker. Chat stays in tab memory. A configured remote model receives only the current opted-in public question and public context, subject to identifier and injection guards. Keep personal information out of free text since these guards cannot recognize every sensitive string. Provider retention is governed by the operator.
- The microphone starts only on user action, below the composer. Browser transcription can use a browser-operated service. When configured and explicitly selected, the optional authenticated `POST /api/citizen/assistant/transcribe` forwards a short bounded recording to the speech provider. Transcripts are editable before sending. Playback uses a local device voice in the answer language, with controls for rate, voice choice, pause, stop and mute. If recognition or a voice is unavailable, typing and text remain available.

## Files

- Backend: `backend/app/core/jansetu_provider.py`, `backend/app/core/jansetu_search.py`, `backend/app/routers/jansetu.py`, `backend/app/core/config.py`, `backend/app/main.py`, `backend/.env.example`, and `backend/tests/test_jansetu.py`.
- Frontend: `frontend/src/citizen-assistant.tsx`, `frontend/src/citizen-voice.tsx`, `frontend/src/jansetu-api.ts`, `frontend/src/jansetu-copy.ts`, `frontend/src/jansetu-results.tsx`, `frontend/src/jansetu.css`, `frontend/src/citizen-context.tsx`, `frontend/src/document-consistency.tsx`, `frontend/src/assistant.tsx`, `frontend/src/guided-assistant.tsx`, `frontend/package.json`, and `frontend/tests/jansetu-browser.test.mjs`.
- Local inference artifacts live in the ignored `.jansetu-local` directory. The provider runtime, downloaded weights and synthetic smoke-test data are local verification assets.

## Tests

Run `python -m pytest -q` from the backend environment. From the frontend, run `npm.cmd run build`, `npm.cmd run test:jansetu-browser`, `npm.cmd run test:scan`, and `npm.cmd run test:scan-browser`. The JanSetu browser suite simulates permission, speech events and voices. It verifies the interface and consent flow without using a physical microphone or speaker. The separate loopback smoke test uses actual model inference and public synthetic questions.

[llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) · [Qwen verification model](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) · [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
