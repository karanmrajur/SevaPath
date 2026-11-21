import type { ReviewData } from './document-consistency-engine.ts'

export type EncryptedReview = { salt: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer>; encrypted: ArrayBuffer }
const encoder = new TextEncoder()
const storeName = 'reviews'

export async function reviewKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function parameters(scope: string, iv: Uint8Array<ArrayBuffer>) {
  return { name: 'AES-GCM', iv, additionalData: encoder.encode('sevapath:document-consistency:v1:' + scope) }
}

export async function sealReview(scope: string, key: CryptoKey, salt: EncryptedReview['salt'], data: ReviewData): Promise<EncryptedReview> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(parameters(scope, nonce), key, encoder.encode(JSON.stringify(data)))
  return { salt, nonce, encrypted }
}

export async function openReview(scope: string, key: CryptoKey, record: EncryptedReview): Promise<ReviewData> {
  const data = await crypto.subtle.decrypt(parameters(scope, record.nonce), key, record.encrypted)
  return JSON.parse(new TextDecoder().decode(data)) as ReviewData
}

async function access<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, result: (value: T) => void) => void) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('sevapath-document-consistency', 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      let output: T
      transaction.oncomplete = () => resolve(output)
      transaction.onabort = () => reject(transaction.error ?? new Error('Encrypted history changed in another tab. Reload it to continue.'))
      transaction.onerror = () => reject(transaction.error)
      operation(transaction.objectStore(storeName), result => { output = result })
    })
  } finally { db.close() }
}

export function readReview(scope: string) {
  return access<EncryptedReview | undefined>('readonly', (store, result) => {
    const request = store.get(scope)
    request.onsuccess = () => result(request.result)
  })
}

export function putReview(scope: string, record: EncryptedReview, previous?: EncryptedReview['nonce']) {
  return access<void>('readwrite', (store, result) => {
    const request = store.get(scope)
    request.onsuccess = () => {
      const found = request.result as EncryptedReview | undefined
      if (found ? !previous || !found.nonce.every((byte, index) => byte === previous[index]) : previous) {
        store.transaction.abort()
        return
      }
      store.put(record, scope)
      result()
    }
  })
}

export function deleteReview(scope: string) {
  return access<void>('readwrite', (store, result) => {
    store.delete(scope)
    result()
  })
}
