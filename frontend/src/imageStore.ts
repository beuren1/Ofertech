const DATABASE_NAME = 'promoforge-artwork'
const STORE_NAME = 'product-images'
const DATABASE_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('Este navegador não oferece armazenamento local de imagens.'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o armazenamento de imagens.'))
  })
}

export async function saveProductImage(file: File) {
  const key = crypto.randomUUID()
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(file, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Não foi possível salvar a foto neste navegador.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('O salvamento da foto foi cancelado.'))
    })
  } finally {
    database.close()
  }
  return key
}

export async function readProductImage(key: string): Promise<Blob | null> {
  const database = await openDatabase()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
      request.onerror = () => reject(request.error ?? new Error('Não foi possível recuperar a foto local.'))
    })
  } finally {
    database.close()
  }
}
