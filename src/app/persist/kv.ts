// 브라우저 저장소(IndexedDB) 키-값 한 겹(스펙 §5.5). 저장 모듈(storage.ts)만 씁니다. 시험은 memoryKv로 바꿔 끼웁니다.
// idb-keyval과 같은 모양(한 데이터베이스·한 저장소)을 의존성 없이 직접 씁니다.

export interface Kv {
  /** 모든 [키, 값] */
  entries(): Promise<Array<[string, unknown]>>
  /** 한 번(한 트랜잭션)에 씀 */
  setMany(entries: Array<[string, unknown]>): Promise<void>
  delMany(keys: string[]): Promise<void>
}

const DB_NAME = 'tentfit'
const STORE = 'kv'

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB 요청 실패'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 쓰기 실패'))
  })
}

/** IndexedDB를 엽니다. 없거나(사생활 보호·차단) 열지 못하면 null */
export async function openIdbKv(): Promise<Kv | null> {
  if (typeof indexedDB === 'undefined') return null
  let db: IDBDatabase
  try {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE)
    }
    db = await req(open)
  } catch {
    return null
  }
  return {
    async entries() {
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())])
      return keys.map((k, i): [string, unknown] => [String(k), values[i]])
    },
    async setMany(entries) {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const [k, v] of entries) store.put(v, k)
      await done(tx)
    },
    async delMany(keys) {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const k of keys) store.delete(k)
      await done(tx)
    },
  }
}

/** 시험·저장 불가 환경용 메모리 저장소 */
export function memoryKv(initial: Array<[string, unknown]> = []): Kv & { data: Map<string, unknown> } {
  const data = new Map(initial)
  return {
    data,
    entries: async () => [...data.entries()],
    setMany: async (entries) => {
      for (const [k, v] of entries) data.set(k, structuredClone(v))
    },
    delMany: async (keys) => {
      for (const k of keys) data.delete(k)
    },
  }
}
