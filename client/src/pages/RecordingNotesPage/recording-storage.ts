interface StoredRecordingSession {
  createdAt: number;
  durationMs: number;
  id: string;
  mimeType: string;
  status: 'recording' | 'complete';
  title: string;
  updatedAt: number;
}

interface StoredRecordingChunk {
  blob: Blob;
  id: string;
  index: number;
  sessionId: string;
}

export interface RecoverableRecording {
  blob: Blob;
  chunkCount: number;
  durationMs: number;
  interrupted: boolean;
  mimeType: string;
  sessionId: string;
  title: string;
}

const DATABASE_NAME = 'media-notes-recordings';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'sessions';
const CHUNK_STORE = 'chunks';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('当前浏览器不支持录音恢复存储'));
      return;
    }
    const request: IDBOpenDBRequest = window.indexedDB.open(
      DATABASE_NAME,
      DATABASE_VERSION,
    );
    request.onerror = () => reject(request.error || new Error('录音存储打开失败'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database: IDBDatabase = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(CHUNK_STORE)) {
        const store: IDBObjectStore = database.createObjectStore(CHUNK_STORE, {
          keyPath: 'id',
        });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

export async function checkRecordingStorage(): Promise<void> {
  const database: IDBDatabase = await openDatabase();
  database.close();
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('录音存储写入失败'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('录音存储写入已取消'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('录音存储读取失败'));
  });
}

export async function startStoredRecording(
  session: Omit<StoredRecordingSession, 'createdAt' | 'durationMs' | 'status' | 'updatedAt'>,
): Promise<void> {
  const database: IDBDatabase = await openDatabase();
  const transaction: IDBTransaction = database.transaction(
    SESSION_STORE,
    'readwrite',
  );
  const completion: Promise<void> = waitForTransaction(transaction);
  const now: number = Date.now();
  transaction.objectStore(SESSION_STORE).put({
    ...session,
    createdAt: now,
    durationMs: 0,
    status: 'recording',
    updatedAt: now,
  } satisfies StoredRecordingSession);
  await completion;
  database.close();
}

export async function appendStoredRecordingChunk(input: {
  blob: Blob;
  durationMs: number;
  index: number;
  sessionId: string;
}): Promise<void> {
  const database: IDBDatabase = await openDatabase();
  const chunkTransaction: IDBTransaction = database.transaction(
    CHUNK_STORE,
    'readwrite',
  );
  const chunkCompletion: Promise<void> = waitForTransaction(chunkTransaction);
  chunkTransaction.objectStore(CHUNK_STORE).put({
    blob: input.blob,
    id: `${input.sessionId}:${String(input.index).padStart(8, '0')}`,
    index: input.index,
    sessionId: input.sessionId,
  } satisfies StoredRecordingChunk);
  await chunkCompletion;
  const sessionReadTransaction: IDBTransaction = database.transaction(
    SESSION_STORE,
    'readonly',
  );
  const sessionReadCompletion: Promise<void> = waitForTransaction(
    sessionReadTransaction,
  );
  const session: StoredRecordingSession | undefined = await requestResult(
    sessionReadTransaction.objectStore(SESSION_STORE).get(input.sessionId),
  );
  await sessionReadCompletion;
  if (session) {
    const sessionWriteTransaction: IDBTransaction = database.transaction(
      SESSION_STORE,
      'readwrite',
    );
    const sessionWriteCompletion: Promise<void> = waitForTransaction(
      sessionWriteTransaction,
    );
    sessionWriteTransaction.objectStore(SESSION_STORE).put({
      ...session,
      durationMs: input.durationMs,
      updatedAt: Date.now(),
    } satisfies StoredRecordingSession);
    await sessionWriteCompletion;
  }
  database.close();
}

export async function finishStoredRecording(
  sessionId: string,
  durationMs: number,
): Promise<void> {
  const database: IDBDatabase = await openDatabase();
  const readTransaction: IDBTransaction = database.transaction(
    SESSION_STORE,
    'readonly',
  );
  const readCompletion: Promise<void> = waitForTransaction(readTransaction);
  const session: StoredRecordingSession | undefined = await requestResult(
    readTransaction.objectStore(SESSION_STORE).get(sessionId),
  );
  await readCompletion;
  if (session) {
    const writeTransaction: IDBTransaction = database.transaction(
      SESSION_STORE,
      'readwrite',
    );
    const writeCompletion: Promise<void> = waitForTransaction(writeTransaction);
    writeTransaction.objectStore(SESSION_STORE).put({
      ...session,
      durationMs,
      status: 'complete',
      updatedAt: Date.now(),
    } satisfies StoredRecordingSession);
    await writeCompletion;
  }
  database.close();
}

export async function loadLatestStoredRecording(): Promise<RecoverableRecording | null> {
  const database: IDBDatabase = await openDatabase();
  const sessionTransaction: IDBTransaction = database.transaction(
    SESSION_STORE,
    'readonly',
  );
  const sessionCompletion: Promise<void> = waitForTransaction(
    sessionTransaction,
  );
  const sessions: StoredRecordingSession[] = await requestResult(
    sessionTransaction.objectStore(SESSION_STORE).getAll(),
  );
  await sessionCompletion;
  const session: StoredRecordingSession | undefined = sessions.sort(
    (left: StoredRecordingSession, right: StoredRecordingSession) =>
      right.updatedAt - left.updatedAt,
  )[0];
  if (!session) {
    database.close();
    return null;
  }
  const chunkTransaction: IDBTransaction = database.transaction(
    CHUNK_STORE,
    'readonly',
  );
  const chunkCompletion: Promise<void> = waitForTransaction(chunkTransaction);
  const chunks: StoredRecordingChunk[] = await requestResult(
    chunkTransaction
      .objectStore(CHUNK_STORE)
      .index('sessionId')
      .getAll(session.id),
  );
  await chunkCompletion;
  database.close();
  const orderedChunks: StoredRecordingChunk[] = chunks.sort(
    (left: StoredRecordingChunk, right: StoredRecordingChunk) =>
      left.index - right.index,
  );
  if (orderedChunks.length === 0) return null;
  return {
    blob: new Blob(
      orderedChunks.map((chunk: StoredRecordingChunk) => chunk.blob),
      { type: session.mimeType },
    ),
    chunkCount: orderedChunks.length,
    durationMs: session.durationMs,
    interrupted: session.status === 'recording',
    mimeType: session.mimeType,
    sessionId: session.id,
    title: session.title,
  };
}

export async function deleteStoredRecording(sessionId: string): Promise<void> {
  const database: IDBDatabase = await openDatabase();
  const transaction: IDBTransaction = database.transaction(
    [SESSION_STORE, CHUNK_STORE],
    'readwrite',
  );
  const completion: Promise<void> = waitForTransaction(transaction);
  transaction.objectStore(SESSION_STORE).delete(sessionId);
  const chunkStore: IDBObjectStore = transaction.objectStore(CHUNK_STORE);
  const chunkIds: IDBValidKey[] = await requestResult(
    chunkStore.index('sessionId').getAllKeys(sessionId),
  );
  chunkIds.forEach((chunkId: IDBValidKey) => chunkStore.delete(chunkId));
  await completion;
  database.close();
}
