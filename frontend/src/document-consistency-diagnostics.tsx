import type { NameExtraction, OcrValue } from './document-consistency-engine'
import type { OcrPhase } from './local-ocr'
import { ocrModels, recognizedLanguages, type OcrReading } from './ocr-models'
import type { ScanType } from './document-scan-engine'

type ReviewPhase = OcrPhase | 'Waiting for a file' | 'File selected' | 'Reading wallet image' | 'Awaiting review'
  | 'Manual transcription' | 'OCR failed; manual review' | 'Confirmed' | 'Cancelled'

export type ReviewTrace = {
  type: ScanType
  phase: ReviewPhase
  failedAt?: ReviewPhase
  reading?: OcrReading
  extraction?: NameExtraction
  detectedName?: OcrValue
  recordId?: string
}

export function ConsistencyDiagnostics({ trace, prior, history, comparable, evaluated, conflicts, reason }: {
  trace: ReviewTrace; prior: number; history: string; comparable: number; evaluated: boolean; conflicts: number; reason: string;
}) {
  const extraction = { label: 'Found by label', 'layout-candidate': 'Found by layout; confirm ownership',
    ambiguous: 'Ambiguous; confirm manually', missing: 'Not extracted' }
  const reading = trace.reading
  return <details className="consistency-diagnostics">
    <summary>OCR diagnostics (private)</summary>
    <p className="metadata">Visible only in this unlocked wallet. Diagnostics stay on this device.</p>
    <dl className="citizen-two consistency-counts">
      <div><dt>Document type</dt><dd>{trace.type}</dd></div>
      <div><dt>OCR status</dt><dd>{trace.phase}{trace.failedAt && ' · Last stage: ' + trace.failedAt}</dd></div>
      <div><dt>Detected language and script</dt><dd>{reading?.scripts.length ? recognizedLanguages(reading.scripts).join(', ') : 'Undetermined'}</dd></div>
      <div><dt>Models used</dt><dd>{reading?.models.map(model => ocrModels[model].label).join(', ') || '—'}</dd></div>
      <div><dt>Name field found</dt><dd>{trace.extraction ? extraction[trace.extraction] : 'Not evaluated'}</dd></div>
      <div><dt>Extracted name</dt><dd><bdi>{trace.detectedName?.value ?? '—'}</bdi></dd></div>
      <div><dt>OCR confidence</dt><dd>Page {reading?.confidence == null ? 'unavailable' : reading.confidence + '%'} · Name {trace.detectedName?.confidence == null ? 'unavailable' : trace.detectedName.confidence + '%'}</dd></div>
      <div><dt>Prior records loaded</dt><dd>{history} · {prior} prior {prior === 1 ? 'record' : 'records'}</dd></div>
      <div><dt>Comparable prior documents (full name)</dt><dd>{comparable}</dd></div>
      <div><dt>Comparison executed</dt><dd>{evaluated ? 'Yes' : 'No'}</dd></div>
      <div><dt>Conflict count</dt><dd>{conflicts}</dd></div>
      <div><dt>Full name comparison</dt><dd>{reason}</dd></div>
    </dl>
  </details>
}
