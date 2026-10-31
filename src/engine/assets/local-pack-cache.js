const DATABASE_NAME = "minecraft-weblab-local-assets";
const DATABASE_VERSION = 1;
const STORE_NAME = "packages";
const PACK_KEY = "bedrock-prepared-zip";

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB não está disponível neste navegador."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento local."));
    request.onblocked = () => reject(new Error("O armazenamento local está ocupado por outra aba do WebLab."));
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Falha ao gravar o pacote local."));
    transaction.onabort = () => reject(transaction.error || new Error("Gravação local cancelada."));
  });
}

export async function saveLocalPackArchive(file) {
  if (!(file instanceof Blob)) throw new TypeError("O pacote local precisa ser um arquivo ZIP.");
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = completeTransaction(transaction);
    transaction.objectStore(STORE_NAME).put({
      blob: file,
      name: file.name || "bedrock-assets-prepared.zip",
      type: file.type || "application/zip",
      lastModified: file.lastModified || Date.now()
    }, PACK_KEY);
    await done;
  } finally {
    database.close();
  }
}

export async function loadLocalPackArchive() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const done = completeTransaction(transaction);
    const request = transaction.objectStore(STORE_NAME).get(PACK_KEY);
    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Não foi possível ler o pacote salvo."));
    });
    await done;
    if (!result?.blob) return null;
    return new File([result.blob], result.name || "bedrock-assets-prepared.zip", {
      type: result.type || "application/zip",
      lastModified: result.lastModified || Date.now()
    });
  } finally {
    database.close();
  }
}

export async function clearLocalPackArchive() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const done = completeTransaction(transaction);
    transaction.objectStore(STORE_NAME).delete(PACK_KEY);
    await done;
  } finally {
    database.close();
  }
}
