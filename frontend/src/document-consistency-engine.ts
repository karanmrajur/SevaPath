import { derivedAge, indiaToday, normalizedDate, type ConfirmedDocument, type ScanType } from './document-scan-engine.ts'
import { explicitApplicants, nativeAliases } from './ocr-field-labels.ts'
import { observedScripts } from './ocr-models.ts'
import type { PreparationStep, Interest } from './citizen-preparation-engine.ts'

export const fields = {
  name: 'Full name', firstName: 'First name', middleName: 'Middle name', lastName: 'Last name',
  father: 'Father’s name', mother: 'Mother’s name', guardian: 'Guardian’s name',
  dob: 'Date of birth', gender: 'Gender', permanentAddress: 'Permanent address', currentAddress: 'Current address', address: 'Address as printed',
  state: 'State', district: 'District', village: 'Village', pin: 'PIN code', caste: 'Caste', category: 'Category',
  income: 'Annual income', year: 'Financial year', accountHolder: 'Bank account holder name',
  landowner: 'Landowner name', relationship: 'Relationship to household head',
  issued: 'Certificate issue date', expires: 'Certificate expiry date', age: 'Age in completed years',
  landholding: 'Landholding farmer family', householdHead: 'Woman listed as household head',
} as const

export type Field = keyof typeof fields
export type Values = Partial<Record<Field, string>>
export type OcrValue = { value: string; confidence: number | null }
export type Evidence = Partial<Record<Field, OcrValue & { alternates?: OcrValue[] }>>
export type NameExtraction = 'label' | 'layout-candidate' | 'ambiguous' | 'missing'
export type OcrLine = {
  text: string; confidence: number | null;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}
export type AddressScope = '' | 'current' | 'permanent'
export type ScanRecord = {
  id: string; type: ScanType; confirmedAt: string; values: Values; evidence: Evidence;
  addressScope: AddressScope; documentKey: string; supersedes?: string; walletFile?: string; nameVerified?: true;
  nameCandidates?: OcrValue[];
}
export type Classification = 'MATCH' | 'POSSIBLE_MATCH' | 'MISMATCH' | 'MISSING_INFORMATION' | 'UNVERIFIED'
export type Decision = {
  key: string; field: Field; sources: string[]; action: 'select' | 'manual' | 'both' | 'later';
  value?: string; selectedSource?: string; confirmedAt: string; status: 'user_confirmed' | 'unverified';
}
export type FamilyProfile = { id: string; interest: Interest; age?: number }
export type ReviewData = {
  records: ScanRecord[]; decisions: Decision[];
  preparation?: { plans?: Record<string, PreparationStep[]>; reminderDays?: number; family?: FamilyProfile[] };
}
export const emptyReview = (): ReviewData => ({ records: [], decisions: [] })

export function latestDecision(data: ReviewData, key: string) {
  for (let index = data.decisions.length - 1; index >= 0; index--) {
    const decision = data.decisions[index]
    if (decision.key === key) return decision
  }
  return undefined
}

const aliases: Record<string, Field> = {
  name: 'name', 'full name': 'name', 'name of applicant': 'name', 'applicant name': 'name', 'applicant s name': 'name',
  'resident name': 'name', 'name of resident': 'name', 'beneficiary name': 'name', 'name of beneficiary': 'name', 'name of the applicant': 'name', 'name of the beneficiary': 'name',
  'first name': 'firstName', 'middle name': 'middleName', 'last name': 'lastName', surname: 'lastName',
  'father s name': 'father', 'father name': 'father', 'name of father': 'father',
  'mother s name': 'mother', 'mother name': 'mother', 'name of mother': 'mother',
  'guardian s name': 'guardian', 'guardian name': 'guardian', 'name of guardian': 'guardian', 'date of birth': 'dob', dob: 'dob', 'd o b': 'dob',
  gender: 'gender', sex: 'gender', address: 'address', 'permanent address': 'permanentAddress', 'current address': 'currentAddress',
  'temporary address': 'currentAddress', state: 'state', district: 'district', village: 'village', 'village name': 'village', pin: 'pin', 'pin code': 'pin', pincode: 'pin',
  caste: 'caste', category: 'category', 'reservation category': 'category', 'annual income': 'income',
  'financial year': 'year', 'account holder name': 'accountHolder', 'bank account holder name': 'accountHolder',
  'landowner name': 'landowner', 'land owner name': 'landowner',
  'relationship to household head': 'relationship', 'relationship to head of household': 'relationship',
  'certificate issue date': 'issued', 'date of issue': 'issued', 'issue date': 'issued',
  'expiry date': 'expires', 'certificate expiry date': 'expires', 'valid until': 'expires', 'valid till': 'expires',
  age: 'age', 'applicant is a landholding farmer': 'landholding', 'applicant family is a landholding family': 'landholding',
  'applicant is the woman listed as head of household': 'householdHead',
}
const namedFields = new Set<Field>(['name', 'firstName', 'middleName', 'lastName', 'father', 'mother', 'guardian', 'accountHolder', 'landowner'])
const dates = new Set<Field>(['dob', 'issued', 'expires'])
const scopeFields = new Set<Field>(['state', 'district', 'village', 'pin'])
export const multiplePeople = (type: ScanType) => ['Ration card', 'RTC / Pahani / Land Records', 'Bank Passbook', 'Farmer document'].includes(type)

function digits(text: string) {
  const zeroes = [0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xabf0, 0x1c50]
  return text.replace(/\p{Nd}/gu, digit => {
    const point = digit.codePointAt(0)!
    const zero = zeroes.find(code => point >= code && point < code + 10)
    return zero === undefined ? digit : String(point - zero)
  })
}

export function safeValue(field: Field, input: string) {
  const value = input.trim()
  if (!value || value.length > 240 || /\p{C}/u.test(value.replace(/[\u200c\u200d]/gu, ''))) return ''
  const ascii = digits(value)
  // Grouped and ungrouped identity numbers are excluded even when OCR places them on an allowed line.
  if (/\d(?:[\s./-]*\d){9}/u.test(ascii) || /\b[A-Z]{5}\d{4}[A-Z]\b/iu.test(ascii)) return ''
  if (namedFields.has(field)) return /^[\p{L}\p{M}\p{Zs}\u200c\u200d.'’·-]+$/u.test(value) && /\p{L}/u.test(value) ? value : ''
  if (dates.has(field)) {
    const iso = normalizedDate(ascii)
    return iso && (field !== 'dob' || derivedAge(iso, indiaToday())) ? value : ''
  }
  if (field === 'age') return /^\d{1,3}$/u.test(ascii) && Number(ascii) <= 125 ? value : ''
  if (field === 'income') return /^(?:(?:₹|rs\.?|inr)\s*)?\d[\d,]*(?:\.\d{1,2})?$/iu.test(ascii) ? value : ''
  if (field === 'year') return normalizeYear(ascii) ? value : ''
  if (field === 'pin') return /^[1-9]\d{5}$/u.test(ascii) ? value : ''
  if (field === 'landholding' || field === 'householdHead') return /^(yes|no)$/iu.test(value) ? value : ''
  return value
}

function normalizeYear(value: string) {
  const match = /^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/u.exec(value.trim())
  if (!match) return ''
  const next = String(Number(match[1]) + 1)
  return next.endsWith(match[2]) ? match[1] + '-' + next : ''
}

function normalized(text: string) {
  return digits(text.normalize('NFKC')).toLocaleLowerCase('en-IN').replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim()
}

function compareKey(field: Field, value: string) {
  const ascii = digits(value)
  if (namedFields.has(field)) return value.normalize('NFC').toLocaleLowerCase('en-IN')
    .replace(/\s+/gu, ' ').trim()
  if (dates.has(field)) return normalizedDate(ascii)
  if (field === 'year') return normalizeYear(ascii)
  if (field === 'income') return String(Number(ascii.replace(/^(?:₹|rs\.?|inr)\s*/iu, '').replaceAll(',', '')))
  if (field === 'age') return String(Number(ascii))
  if (field === 'gender') {
    const key = normalized(ascii)
    return ({ m: 'male', f: 'female', 'third gender': 'third gender', transgender: 'transgender' } as Record<string, string>)[key] ?? key
  }
  return normalized(ascii)
}

for (const [field, labels] of Object.entries(nativeAliases)) {
  for (const label of labels) aliases[normalized(label)] = field as Field
}
const applicantLabels = new Set(explicitApplicants.map(normalized))

function extractLabel(raw: string) {
  // Some bilingual forms print “नाम / Name” above one original-script value.
  const keys = raw.split('/').map(key => normalized(key.replace(/\s*\((?:english|hindi|kannada|local language|अंग्रेजी|हिंदी|ಕನ್ನಡ|ಇಂಗ್ಲಿಷ್)\)\s*$/iu, '')
    .replace(/\s*[*：:]+\s*$/u, ''))).filter(Boolean)
  if (!keys.length) return
  const matches = keys.map(key => {
    const applicant = key.startsWith('applicant ') || key === 'name of applicant' || key === 'name of the applicant'
      || key.startsWith('resident ') || key === 'name of resident'
      || key.startsWith('beneficiary ') || key === 'name of beneficiary' || key === 'name of the beneficiary' || applicantLabels.has(key)
    const alias = Object.hasOwn(aliases, key) ? key : key.startsWith('applicant ') ? key.slice(10) : ''
    return { applicant, field: Object.hasOwn(aliases, alias) ? aliases[alias] : undefined }
  })
  const field = matches[0].field
  if (field && matches.every(match => match.field === field)) return { field, applicant: matches.some(match => match.applicant) }
}

function readLine(text: string) {
  const direct = /^\s*([^:=：]{2,90})\s*[:=：]\s*(.*?)\s*$/u.exec(text)
  if (direct) {
    const label = extractLabel(direct[1])
    if (label) return { ...label, raw: direct[2] }
  }
  const whole = extractLabel(text)
  if (whole) return { ...whole, raw: '' }
  const spaces = [...text.matchAll(/\s+/gu)].reverse()
  for (const space of spaces) {
    const label = extractLabel(text.slice(0, space.index))
    if (label) return { ...label, raw: text.slice(space.index + space[0].length) }
  }
}

function cleanConfidence(value: number | null) {
  return value !== null && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null
}

function ownerBoundary(text: string) {
  const key = normalized(text)
  return /^(?:s o|d o|w o|c o|care of|son of|daughter of|wife of|husband of|spouse|father|mother|guardian|certifier|issuing officer|signature|name of (?:spouse|husband|wife|certifier|officer)|पुत्र|पुत्री|पिता|माता|पति|पत्नी|अभिभावक|ತಂದೆ|ತಾಯಿ|ಪತಿ|ಪತ್ನಿ|ಪೋಷಕ)(?:\s|$)/u.test(key)
}

function nameFromLine(text: string) {
  if (readLine(text) || ownerBoundary(text)) return ''
  const key = normalized(text)
  if (/^(?:government of india|government of karnataka|unique identification authority of india|भारत सरकार|भारतीय विशिष्ट पहचान प्राधिकरण|ಕರ್ನಾಟಕ ಸರ್ಕಾರ|your aadhaar|aadhaar|आधार|income certificate|आय प्रमाण पत्र|male|female|पुरुष|महिला|ಪುರುಷ|ಮಹಿಳೆ|to)$/u.test(key)) return ''
  return safeValue('name', text)
}

function nearby(a: OcrLine, b: OcrLine) {
  if (!a.bbox || !b.bbox) return true
  const first = a.bbox, second = b.bbox
  const height = Math.max(first.y1 - first.y0, second.y1 - second.y0)
  const xTolerance = height * 2.5
  return Math.abs(second.y0 - first.y0) <= height * 2.2
    && (Math.abs(first.x0 - second.x0) <= xTolerance
      || (Math.abs(second.y0 - first.y0) < height * 0.55 && second.x0 >= first.x1))
}

function joinedLines(source: OcrLine[]) {
  const lines: OcrLine[] = []
  for (let index = 0; index < source.length; index++) {
    const line = source[index]
    const following = source[index + 1]
    if (following && nearby(line, following)) {
      const entry = readLine(line.text)
      const next = readLine(following.text)
      const text = line.text.trim() + ' ' + following.text.trim()
      const combined = !entry?.raw && (!entry || next?.field === entry.field) ? readLine(text) : undefined
      if (combined && (!entry || combined.field === entry.field)) {
        const confidence = line.confidence === null || following.confidence === null ? null
          : Math.min(line.confidence, following.confidence)
        const a = line.bbox, b = following.bbox
        const bbox = a && b ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a
        lines.push({ text, confidence, bbox })
        index++
        continue
      }
    }
    const parts = line.text.split(/\s+[\/|]\s+/u)
    if (parts.length > 1 && parts.every(text => /[:=：]/u.test(text) && readLine(text)?.raw)) {
      lines.push(...parts.map(text => ({ ...line, text })))
    } else lines.push(line)
  }
  return lines
}

function adjacentValue(lines: OcrLine[], index: number, field: Field) {
  const label = lines[index]
  // Tesseract may deliver a value cell before the matching label in another text block.
  const box = label.bbox
  let right: OcrLine | undefined
  if (box) {
    const height = box.y1 - box.y0
    const cells = lines.flatMap(candidate => candidate.bbox && candidate.bbox.x0 >= box.x1
      && Math.abs(candidate.bbox.y0 - box.y0) < height * 0.5 ? [{ candidate, left: candidate.bbox.x0 }] : [])
    const first = cells.sort((a, b) => a.left - b.left)[0]?.candidate
    if (first && !readLine(first.text) && !ownerBoundary(first.text)) right = first
  }
  const next = right ?? lines[index + 1]
  if (!next || !nearby(label, next) || readLine(next.text) || ownerBoundary(next.text)) return
  if (namedFields.has(field) && !nameFromLine(next.text)) return
  return next
}

function aadhaarName(lines: OcrLine[]): { name?: OcrValue & { alternates?: OcrValue[] }; ambiguous?: boolean } {
  for (let index = 1; index < lines.length; index++) {
    const current = lines[index]
    const date = readLine(current.text)
    const dob = date?.field === 'dob' && safeValue('dob', date.raw || adjacentValue(lines, index, 'dob')?.text || '')
    const year = /^(?:year of birth|yob|जन्म वर्ष|ಜನ್ಮ ವರ್ಷ)(?:\s+year of birth)?\s+\d{4}$/u.test(normalized(current.text))
    if (!dob && !year) continue
    const gender = lines.slice(index + 1, index + 4).some(line =>
      readLine(line.text)?.field === 'gender'
      || /^(?:(?:male|female|पुरुष|महिला|ಪುರುಷ|ಮಹಿಳೆ)\s*){1,2}$/u.test(normalized(line.text)))
    if (!gender) continue
    const near = lines[index - 1]
    if (!nearby(current, near) || readLine(near.text) || ownerBoundary(near.text)) continue
    const parts = near.text.split(/\s*[\/|]\s*/u)
    const previous = lines[index - 2]
    const candidates = parts.length > 1 ? parts.map(text => ({ ...near, text }))
      : previous && nearby(near, previous) && nameFromLine(previous.text) ? [previous, near] : [near]
    const names = candidates.map(line => ({ value: nameFromLine(line.text), confidence: cleanConfidence(line.confidence) }))
    if (names.some(name => !name.value) || names.length > 2) return { ambiguous: true }
    if (names.length === 1) return { name: names[0] }
    const [a, b] = names
    const left = compareKey('name', a.value), right = compareKey('name', b.value)
    if (left === right) return { name: (a.confidence ?? -1) >= (b.confidence ?? -1) ? a : b }
    if (nameScript(left) === nameScript(right) || compareNames(left, right).status !== 'POSSIBLE_MATCH') return { ambiguous: true }
    const [original, alternate] = nameScript(a.value) === 'Latin' ? [b, a] : [a, b]
    return { name: { ...original, alternates: [alternate] } }
  }
  return {}
}

function incomeName(lines: OcrLine[]): { name?: OcrValue; ambiguous?: boolean } {
  const clauses = [
    /^(?:this is to certify that|it is certified that)\s+(?:(?:shri|sri|smt|mr|ms)\.?\s+)?(.{1,120}?)\s+(?:[sdw]\s*\/\s*o\b|son of|daughter of|wife of|husband of)(?:[\s.:]|$)/iu,
    /^(?:यह\s+)?प्रमाणित\s+किया\s+जाता\s+है\s+कि\s+(?:(?:श्री|श्रीमती|कुमारी)\s+)?(.{1,120}?)\s+(?:पुत्र|पुत्री|पत्नी)(?:[\s:/]|$)/u,
  ]
  const found = new Map<string, OcrValue>()
  for (const [index, line] of lines.entries()) {
    const next = lines[index + 1]
    const text = line.text.trim()
    let source = [line]
    let candidate = clauses.map(clause => clause.exec(text)?.[1]).find(Boolean)
    if (!candidate && next && nearby(line, next)) {
      source = [line, next]
      candidate = clauses.map(clause => clause.exec(text + ' ' + next.text.trim())?.[1]).find(Boolean)
    }
    const value = candidate && nameFromLine(candidate)
    if (!value) continue
    const confidence = source.every(item => item.confidence !== null)
      ? cleanConfidence(Math.min(...source.map(item => item.confidence ?? 0))) : null
    found.set(compareKey('name', value), { value, confidence })
  }
  return found.size > 1 ? { ambiguous: true } : { name: found.values().next().value }
}

export function extractDocumentEvidence(type: ScanType, sourceLines: OcrLine[]): { evidence: Evidence; name: NameExtraction; candidates?: OcrValue[] } {
  const lines = joinedLines(sourceLines)
  const evidence: Evidence = {}
  const ambiguous = new Set<Field>()
  let nameCandidates: OcrValue[] | undefined
  const parsed = lines.map(line => readLine(line.text.trim()))
  const explicit = parsed.some(entry => entry?.field === 'name' && entry.applicant)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const entry = parsed[index]
    if (!entry || ambiguous.has(entry.field)) continue
    const { field, applicant } = entry
    if (field === 'name' && (explicit && !applicant || ownerBoundary(line.text))) continue
    const roleLabel = (type === 'Bank Passbook' && field === 'accountHolder')
      || (type === 'RTC / Pahani / Land Records' && field === 'landowner')
    const multi = multiplePeople(type)
    if (multi && !applicant && !roleLabel) continue
    const adjacent = !entry.raw && (!multi || applicant || roleLabel) ? adjacentValue(lines, index, field) : undefined
    const raw = entry.raw || adjacent?.text || ''
    const separated = field === 'name' ? raw.split(/\s*[\/|]\s*/u) : [raw]
    const names = separated.map(text => safeValue(field, text))
    if (names.some(value => !value || field === 'name' && ownerBoundary(value))) continue
    const [value] = names
    const first = cleanConfidence(line.confidence)
    const second = adjacent ? cleanConfidence(adjacent.confidence) : first
    const confidence = first === null || second === null ? null : Math.min(first, second)
    if (names.length > 1) {
      const candidates = names.slice(0, 3).map(value => ({ value, confidence }))
      const [a, b] = candidates
      if (names.length !== 2 || nameScript(a.value) === nameScript(b.value)
        || compareNames(compareKey('name', a.value), compareKey('name', b.value)).status !== 'POSSIBLE_MATCH') {
        nameCandidates = [...(evidence.name ? [evidence.name, ...(evidence.name.alternates ?? [])] : []), ...candidates].slice(0, 4)
        ambiguous.add('name')
        delete evidence.name
        continue
      }
      const [original, alternate] = nameScript(a.value) === 'Latin' ? [b, a] : [a, b]
      if (!evidence.name || compareKey('name', evidence.name.value) === compareKey('name', original.value)
        || compareKey('name', evidence.name.value) === compareKey('name', alternate.value)) {
        evidence.name = { ...original, alternates: [alternate] }
      } else {
        nameCandidates = [evidence.name, original, alternate]
        ambiguous.add('name')
        delete evidence.name
      }
      continue
    }
    const prior = evidence[field]
    if (!prior) {
      evidence[field] = { value, confidence }
      continue
    }
    if (compareKey(field, prior.value) === compareKey(field, value)) {
      if ((confidence ?? -1) > (prior.confidence ?? -1)) evidence[field] = { ...prior, value, confidence }
      continue
    }
    if (namedFields.has(field)) {
      const candidates = [prior, ...(prior.alternates ?? [])]
      const sameScript = candidates.filter(candidate => nameScript(candidate.value) === nameScript(value))
      if (sameScript.some(candidate => compareKey(field, candidate.value) === compareKey(field, value))) continue
      if (!sameScript.length && nameScript(value) !== 'Mixed' && candidates.length < 3
        && compareNames(compareKey(field, prior.value), compareKey(field, value)).status === 'POSSIBLE_MATCH') {
        if (nameScript(prior.value) === 'Latin' && nameScript(value) !== 'Latin') {
          evidence[field] = { value, confidence, alternates: candidates.map(({ value, confidence }) => ({ value, confidence })) }
        } else {
          evidence[field] = { ...prior, alternates: [...(prior.alternates ?? []), { value, confidence }] }
        }
        continue
      }
    }
    if (field === 'name') nameCandidates = [prior, ...(prior.alternates ?? []), { value, confidence }].slice(0, 4)
    ambiguous.add(field)
    delete evidence[field]
  }
  if (evidence.name) return { evidence, name: 'label' }
  if (ambiguous.has('name')) return { evidence, name: 'ambiguous', candidates: nameCandidates }
  const candidate = type === 'Aadhaar Card' ? aadhaarName(lines) : type === 'Income certificate' ? incomeName(lines) : undefined
  if (candidate?.name) return { evidence: { ...evidence, name: candidate.name }, name: 'layout-candidate' }
  if (candidate?.ambiguous) return { evidence, name: 'ambiguous' }
  return { evidence, name: 'missing' }
}

export function extractEvidence(type: ScanType, lines: OcrLine[]) {
  return extractDocumentEvidence(type, lines).evidence
}

function nameScript(text: string) {
  const scripts = observedScripts(text)
  return scripts.length === 1 ? scripts[0] : 'Mixed'
}

// These two Unicode blocks share the offsets of the common Indic letters.
const consonants = 'k kh g gh ng ch chh j jh ny t th d dh n t th d dh n n p ph b bh m y r r l l zh v sh sh s h'.split(' ')
const vowels: Record<number, string> = { 5: 'a', 6: 'a', 7: 'i', 8: 'i', 9: 'u', 10: 'u', 11: 'ri',
  13: 'e', 14: 'e', 15: 'e', 16: 'ai', 17: 'o', 18: 'o', 19: 'o', 20: 'au' }
const signs: Record<number, string> = { 62: 'a', 63: 'i', 64: 'i', 65: 'u', 66: 'u', 67: 'ri',
  69: 'e', 70: 'e', 71: 'e', 72: 'ai', 73: 'o', 74: 'o', 75: 'o', 76: 'au', 77: '' }

function latinName(text: string, from: string) {
  if (from === 'Latin') return [{ text: text.normalize('NFD').replace(/\p{M}/gu, ''), confidence: 0.93 }]
  if (from !== 'Kannada' && from !== 'Devanagari') return []
  const base = from === 'Kannada' ? 0x0c80 : 0x0900
  const characters = [...text]
  let result = ''
  let finalSchwa = false
  for (let i = 0; i < characters.length; i++) {
    const offset = characters[i].charCodeAt(0) - base
    const next = (characters[i + 1]?.charCodeAt(0) ?? 0) - base
    if (characters[i] === ' ') result += ' '
    else if (consonants[offset - 21]) {
      result += consonants[offset - 21] + (signs[next] ?? 'a')
      if (next in signs) i++
      else if (i === characters.length - 1) finalSchwa = true
    } else if (offset in vowels) result += vowels[offset]
    else if (offset === 2) result += 'n'
    else if (offset === 3) result += 'h'
    else return []
  }
  return [{ text: result, confidence: 0.9 },
    ...(finalSchwa ? [{ text: result.slice(0, -1), confidence: from === 'Devanagari' ? 0.86 : 0.78 }] : [])]
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
function distance(left: string, right: string) {
  const a = [...graphemes.segment(left)].map(item => item.segment)
  const b = [...graphemes.segment(right)].map(item => item.segment)
  let row = b.map((_, index) => index + 1)
  row.unshift(0)
  a.forEach((char, i) => {
    const next = [i + 1]
    b.forEach((other, j) => next.push(Math.min(row[j + 1] + 1, next[j] + 1, row[j] + Number(char !== other))))
    row = next
  })
  return { edits: row[b.length], similarity: 1 - row[b.length] / Math.max(a.length, b.length, 1) }
}

type NameReview = { status: Classification; score?: number; reason?: 'cross-script' | 'name-spelling' }
function compareNames(left: string, right: string, strict = false): NameReview {
  const aScript = nameScript(left), bScript = nameScript(right)
  if (aScript !== bScript || aScript === 'Mixed') {
    let score = 0
    for (const a of latinName(left, aScript)) {
      for (const b of latinName(right, bScript)) {
        const comparison = distance(a.text, b.text)
        score = Math.max(score, comparison.similarity * Math.min(a.confidence, b.confidence))
      }
    }
    return { status: score >= 0.73 ? 'POSSIBLE_MATCH' : 'UNVERIFIED',
      score: score > 0 ? Math.round(score * 100) : undefined, reason: 'cross-script' }
  }
  if (strict) return { status: 'MISMATCH', reason: 'name-spelling' }
  const tokens = left.replaceAll('.', '').split(' '), other = right.replaceAll('.', '').split(' ')
  const rearranged = tokens.slice().sort().join(' ') === other.slice().sort().join(' ')
  const spacing = left.replaceAll(' ', '') === right.replaceAll(' ', '')
  if (rearranged || spacing) return { status: 'POSSIBLE_MATCH', reason: 'name-spelling' }
  // Compare original-script spellings before applying any lossy romanization.
  if (aScript !== 'Latin') return { status: 'MISMATCH', reason: 'name-spelling' }
  const initials = tokens.length > 1 && tokens.length === other.length && tokens.every((word, index) =>
    word === other[index] || (word.length === 1 || other[index].length === 1) && word[0] === other[index][0])
  const { edits, similarity } = distance(left, right)
  return {
    status: initials || (edits === 1 && similarity >= 0.75) ? 'POSSIBLE_MATCH' : 'MISMATCH',
    reason: 'name-spelling',
  }
}

function addressKey(text: string) {
  return normalized(text).replace(/\b(?:rd|st|apt|blk|flr)\b/gu, word =>
    ({ rd: 'road', st: 'street', apt: 'apartment', blk: 'block', flr: 'floor' } as Record<string, string>)[word])
}

export function classify(field: Field, a?: string, b?: string, unreliable = false): Classification {
  if (!a || !b) return 'MISSING_INFORMATION'
  const left = compareKey(field, a), right = compareKey(field, b)
  if (!left || !right || unreliable) return 'UNVERIFIED'
  if (left === right) return 'MATCH'
  if (namedFields.has(field)) return compareNames(left, right).status
  if (field === 'currentAddress' || field === 'permanentAddress') {
    const aWords = addressKey(a).split(' '), bWords = addressKey(b).split(' ')
    const aNumbers = aWords.filter(word => /\d/u.test(word)).sort().join(' ')
    const bNumbers = bWords.filter(word => /\d/u.test(word)).sort().join(' ')
    if (aNumbers && bNumbers && aNumbers !== bNumbers) return 'MISMATCH'
    if (aWords.slice().sort().join(' ') === bWords.slice().sort().join(' ')) return 'POSSIBLE_MATCH'
    const shared = new Set(aWords.filter(word => bWords.includes(word))).size
    if (shared >= 3 && shared / Math.max(aWords.length, bWords.length) >= 0.65) return 'POSSIBLE_MATCH'
  }
  return 'MISMATCH'
}

export type Comparison = {
  key: string; field: Field; status: Classification; records: ScanRecord[]; nameReview?: NameReview
  comparedNames?: Record<string, OcrValue>
}
const nameRequired = (record: ScanRecord) => record.type === 'Aadhaar Card' || record.type === 'Income certificate'

export function comparedValue(group: Comparison, record: ScanRecord) {
  return group.comparedNames?.[record.id]?.value ?? fieldValue(record, group.field)
}

function nameForComparison(record: ScanRecord) {
  const value = fieldValue(record, 'name')
  if (!value) return undefined
  const detected = record.evidence[evidenceField(record, 'name')]
  const candidates = detected ? [detected, ...(detected.alternates ?? [])] : []
  const exact = candidates.find(candidate => compareKey('name', candidate.value) === compareKey('name', value))
  if (exact && nameScript(value) === 'Latin') {
    const originals = candidates.filter(candidate => {
      const script = nameScript(candidate.value)
      return script !== 'Mixed' && script !== 'Latin'
    })
    if (originals.length === 1) {
      const { value, confidence } = originals[0]
      return { value, confidence, unreliable: confidence === null || confidence < 75 }
    }
  }
  return {
    value, confidence: exact?.confidence ?? null,
    unreliable: !!exact && !record.nameVerified && (exact.confidence === null || exact.confidence < 75),
  }
}

export function nameDifference(value: string, other: string) {
  const left = [...graphemes.segment(value)].map(part => part.segment)
  const right = [...graphemes.segment(other)].map(part => part.segment)
  const equal = (a?: string, b?: string) => a !== undefined && b !== undefined && compareKey('name', a) === compareKey('name', b)
  let start = 0, end = 0
  while (equal(left[start], right[start])) start++
  while (end < Math.min(left.length, right.length) - start && equal(left[left.length - 1 - end], right[right.length - 1 - end])) end++
  return [left.slice(0, start).join(''), left.slice(start, left.length - end).join(''), left.slice(left.length - end).join('')]
}

export function activeRecords(records: ScanRecord[]) {
  const archived = new Set(records.flatMap(record => record.supersedes ? [record.supersedes] : []))
  return records.filter(record => !archived.has(record.id))
}

export function evidenceField(record: ScanRecord, field: Field): Field {
  if (field === 'age' && record.values.dob) return 'dob'
  if (field === 'name' && !record.values.name) {
    if (record.type === 'Bank Passbook' && record.values.accountHolder) return 'accountHolder'
    if (record.type === 'RTC / Pahani / Land Records' && record.values.landowner) return 'landowner'
  }
  const scopedAddress = field === 'permanentAddress' ? 'permanent' : field === 'currentAddress' ? 'current' : undefined
  if (!record.values[field] && scopedAddress && scopedAddress === record.addressScope) return 'address'
  return field
}

export function fieldValue(record: ScanRecord, field: Field) {
  if (field === 'age' && record.values.dob) return derivedAge(normalizedDate(digits(record.values.dob)), indiaToday()) || undefined
  const value = record.values[evidenceField(record, field)]
  return value ? safeValue(field, value) || undefined : undefined
}

export function comparisons(records: ScanRecord[], draftId?: string): Comparison[] {
  const output: Comparison[] = []
  const active = draftId ? [...activeRecords(records.filter(record => record.id !== draftId)), ...records.filter(record => record.id === draftId)] : activeRecords(records)
  for (const field of Object.keys(fields) as Field[]) {
    if (field === 'address') continue
    const groups = new Map<string, ScanRecord[]>()
    for (const record of active) {
      const scope = field === 'issued' || field === 'expires' ? record.documentKey
        : scopeFields.has(field) ? record.addressScope
        : field === 'income' ? normalizeYear(digits(record.values.year ?? ''))
        : field === 'year' ? record.documentKey : 'applicant'
      if (!scope || ((field === 'income' || field === 'year') && record.type !== 'Income certificate')) continue
      groups.set(scope, [...(groups.get(scope) ?? []), record])
    }
    for (const group of groups.values()) {
      if (group.length < 2 || (draftId && !group.some(record => record.id === draftId))) continue
      const names = field === 'name' ? new Map(group.map(record => [record.id, nameForComparison(record)])) : undefined
      const byRecord = new Map(group.map(record => [record.id, names ? names.get(record.id)?.value : fieldValue(record, field)]))
      const values = group.filter(record => byRecord.get(record.id))
      const missingNames = names ? group.filter(record => nameRequired(record) && !byRecord.get(record.id)) : []
      if (!values.length && missingNames.length < 2) continue
      const relevant = draftId || values.length < 2 ? group : [...values, ...missingNames]
      const states = new Set<Classification>()
      const strictName = !!names && (!draftId || !!active.find(record => record.id === draftId)?.nameVerified)
      const nameReviews: NameReview[] = []
      relevant.forEach((a, index) => relevant.slice(index + 1).forEach(b => {
        if (draftId && a.id !== draftId && b.id !== draftId) return
        const left = byRecord.get(a.id), right = byRecord.get(b.id)
        if (!left && !right) {
          if (names && nameRequired(a) && nameRequired(b)) states.add('MISSING_INFORMATION')
          return
        }
        const unreliable = [a, b].some(record => {
          if (names) return !!names.get(record.id)?.unreliable
          const detectedField = evidenceField(record, field)
          const detected = record.evidence[detectedField]
          if (detectedField === 'name' && record.nameVerified) return false
          return detected && compareKey(detectedField, detected.value) === compareKey(detectedField, record.values[detectedField] ?? '')
            && (detected.confidence === null || detected.confidence < 75)
        })
        if (left && right && !unreliable && namedFields.has(field)) {
          const aKey = compareKey(field, left), bKey = compareKey(field, right)
          if (aKey !== bKey) {
            const review = compareNames(aKey, bKey, strictName)
            states.add(review.status)
            nameReviews.push(review)
            return
          }
        }
        states.add(classify(field, left, right, unreliable))
      }))
      const order: Classification[] = ['MISMATCH', 'POSSIBLE_MATCH', 'UNVERIFIED', 'MISSING_INFORMATION', 'MATCH']
      const status = order.find(candidate => states.has(candidate))
      if (status) output.push({
        field, status, records: relevant, nameReview: nameReviews.find(review => review.status === status),
        ...(names ? { comparedNames: Object.fromEntries([...names].flatMap(([id, name]) =>
          name ? [[id, { value: name.value, confidence: name.confidence }]] : [])) } : {}),
        key: field + ':' + relevant.map(record => record.id).sort().join(','),
      })
    }
  }
  return output
}

export function effectiveDocuments(data: ReviewData, today = indiaToday()) {
  const groups = comparisons(data.records)
  const wins: Values = {}
  const blocked = new Set<Field>()
  const identityFields: Field[] = ['name', 'firstName', 'middleName', 'lastName', 'dob']
  const identityReviews = new Map<string, Set<string>>()
  for (const group of groups) {
    if (group.status === 'MATCH' || group.status === 'MISSING_INFORMATION' && group.field !== 'name') continue
    const decision = latestDecision(data, group.key)
    if (decision?.value) wins[group.field] = decision.value
    else {
      blocked.add(group.field)
      if (identityFields.includes(group.field)) {
        for (const record of group.records.filter(record => group.status === 'MISSING_INFORMATION'
          ? nameRequired(record) && !fieldValue(record, 'name') : fieldValue(record, group.field))) {
          const reasons = identityReviews.get(record.id) ?? new Set()
          reasons.add(fields[group.field])
          identityReviews.set(record.id, reasons)
        }
      }
    }
  }
  const expiryByDocument = new Map<string, string>()
  for (const group of groups.filter(group => group.field === 'expires')) {
    const decision = latestDecision(data, group.key)
    if (decision?.value) expiryByDocument.set(group.records[0].documentKey, decision.value)
  }
  const reviewExpiry = new Set(groups.filter(group => group.field === 'expires' && group.status !== 'MATCH'
    && group.status !== 'MISSING_INFORMATION' && !expiryByDocument.has(group.records[0].documentKey)).map(group => group.records[0].documentKey))
  const unresolvedAge = blocked.has('dob') || (!wins.dob && blocked.has('age'))
  const records = activeRecords(data.records)
  const agesFromBirth = records.map(record => record.values.dob
    ? derivedAge(normalizedDate(digits(record.values.dob)), today) : '').filter(Boolean)
  const agesFromLiteral = records.filter(record => !record.values.dob && record.values.age).map(record => compareKey('age', record.values.age!))
  const literalDisagrees = !wins.age && !wins.dob && new Set([...agesFromBirth, ...agesFromLiteral]).size > 1
  const docAgeReview = unresolvedAge || literalDisagrees
  const documents = records.map(record => {
    const dob = wins.dob ?? record.values.dob
    const age = docAgeReview ? '' : wins.dob ? derivedAge(normalizedDate(digits(wins.dob)), today)
      : wins.age ? compareKey('age', wins.age) : dob ? derivedAge(normalizedDate(digits(dob)), today)
        : record.values.age ? compareKey('age', record.values.age) : ''
    const document: ConfirmedDocument = { type: record.type, age: age === '' ? undefined : Number(age) }
    const expiry = expiryByDocument.get(record.documentKey) ?? record.values.expires
    if (expiry) document.expiresOn = normalizedDate(digits(expiry))
    const reviewFields = [...(identityReviews.get(record.id) ?? [])]
    if (reviewExpiry.has(record.documentKey)) reviewFields.push(fields.expires)
    if (reviewFields.length) {
      document.confirmationPending = true
      document.reviewFields = reviewFields
    }
    const land = blocked.has('landholding') ? undefined : wins.landholding ?? record.values.landholding
    const head = blocked.has('householdHead') ? undefined : wins.householdHead ?? record.values.householdHead
    if (land) document.landholding = land.toLowerCase() === 'yes'
    if (head) document.gruha_lakshmi_household_head = head.toLowerCase() === 'yes'
    return document
  })
  const conflictFields = new Set<string>()
  if (docAgeReview) conflictFields.add('age')
  if (blocked.has('landholding')) conflictFields.add('landholding')
  if (blocked.has('householdHead')) conflictFields.add('gruha_lakshmi_household_head')
  return { documents, conflictFields }
}
