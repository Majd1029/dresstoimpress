/** Immutable D1 image storage. No bucket, paid service, or product reference is required. */
export const MEDIA_BUDGET_BYTES = 100 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_BYTES = 1024 * 1024;
export const MEDIA_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_CHUNK_BYTES = 128 * 1024;
const CHUNKS_PER_STATEMENT = 25;
const encoder = new TextEncoder();

export interface MediaHttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
  cacheExpiry?: Date | string;
}
export interface MediaPutOptions {
  httpMetadata?: MediaHttpMetadata;
  customMetadata?: Record<string, string>;
  /** Only migration code may opt into the original 5 MiB limit and retry verification. */
  import?: {uploaded?: Date | string; etag?: string; duplicate?: 'reject' | 'verify'};
}
export interface MediaObject {
  key: string;
  size: number;
  body: Uint8Array<ArrayBuffer>;
  /** SHA-256 of the exact original bytes, without HTTP quotes. */
  etag: string;
  uploaded: Date;
  sourceEtag?: string;
  httpMetadata: MediaHttpMetadata;
  customMetadata: Record<string, string>;
}
export class MediaError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = 'MediaError'; }
}
interface MediaRow {
  key: string; byte_length: number; chunk_count: number; sha256: string;
  http_metadata: string; custom_metadata: string; uploaded: string; source_etag: string | null;
}

function validKey(key: string) {
  // Keys are opaque SQL values, never filesystem paths. Do not normalize imported keys.
  if (typeof key !== 'string' || !key || key.includes('\0') || encoder.encode(key).length > 1024)
    throw new MediaError('Image key must contain between 1 and 1024 UTF-8 bytes.');
}
function timestamp(value: Date | string | undefined) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new MediaError('Invalid image metadata date.');
  return date.toISOString();
}
function metadata(options: MediaPutOptions) {
  const http: Record<string, string> = {};
  const allowed = new Set(['contentType', 'contentLanguage', 'contentDisposition', 'contentEncoding', 'cacheControl', 'cacheExpiry']);
  for (const [key, value] of Object.entries(options.httpMetadata ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (value === undefined) continue;
    if (!allowed.has(key)) throw new MediaError('Unsupported HTTP image metadata: ' + key);
    if (key === 'cacheExpiry') http[key] = timestamp(value);
    else {
      if (typeof value !== 'string') throw new MediaError('Image HTTP metadata must be text.');
      http[key] = value;
    }
  }
  const custom = Object.fromEntries(Object.entries(options.customMetadata ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  if (Object.values(custom).some(value => typeof value !== 'string')) throw new MediaError('Custom image metadata must be text.');
  const httpJson = JSON.stringify(http), customJson = JSON.stringify(custom);
  if (encoder.encode(httpJson).length + encoder.encode(customJson).length > 32 * 1024)
    throw new MediaError('Image metadata exceeds 32 KiB.', 413);
  return {httpJson, customJson};
}
function asBytes(value: ArrayBuffer | Uint8Array | number[]) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new MediaError('Stored image bytes are invalid.', 503);
}
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.message + (error.cause ? ' ' + errorText(error.cause) : '');
}

/** A batch is one SQLite transaction: a rejected chunk rolls back the object and budget. */
export async function putMedia(database: D1Database, key: string, bytes: Uint8Array, options: MediaPutOptions = {}) {
  validKey(key);
  const max = options.import ? MEDIA_IMPORT_MAX_BYTES : MEDIA_UPLOAD_MAX_BYTES;
  if (!(bytes instanceof Uint8Array) || (!options.import && bytes.length === 0) || bytes.length > max)
    throw new MediaError(options.import ? 'Imported images must be at most 5 MiB.' : 'Each image must contain 1 byte to 1 MiB.', 413);
  if (options.import?.duplicate && !['reject', 'verify'].includes(options.import.duplicate))
    throw new MediaError('Invalid image import duplicate policy.');
  if (options.import?.etag !== undefined && (typeof options.import.etag !== 'string' || encoder.encode(options.import.etag).length > 1024))
    throw new MediaError('Invalid original image ETag.');
  const {httpJson, customJson} = metadata(options);
  const uploaded = timestamp(options.import?.uploaded), sourceEtag = options.import?.etag ?? null;
  // Snapshot before awaiting the digest: callers cannot mutate bytes between hashing and storage.
  const body = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', body);
  const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const chunkCount = Math.ceil(body.length / MEDIA_CHUNK_BYTES);
  const storageBytes = body.length + encoder.encode(key).length * (1 + chunkCount * 2) + encoder.encode(httpJson).length + encoder.encode(customJson).length
    + encoder.encode(sourceEtag ?? '').length + 4096 + chunkCount * 128;
  const statements = [database.prepare(`INSERT INTO media_objects
    (key,byte_length,chunk_count,sha256,http_metadata,custom_metadata,uploaded,source_etag,storage_bytes)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(key, body.length, chunkCount, sha256, httpJson, customJson, uploaded, sourceEtag, storageBytes)];
  for (let start = 0; start < chunkCount; start += CHUNKS_PER_STATEMENT) {
    const values: (string | number | ArrayBuffer)[] = [], rows: string[] = [];
    for (let position = start; position < Math.min(chunkCount, start + CHUNKS_PER_STATEMENT); position++) {
      rows.push('(?,?,?)');
      values.push(key, position, body.slice(position * MEDIA_CHUNK_BYTES, (position + 1) * MEDIA_CHUNK_BYTES).buffer);
    }
    statements.push(database.prepare('INSERT INTO media_chunks (object_key,position,data) VALUES ' + rows.join(',')).bind(...values));
  }
  try {
    await database.batch(statements);
  } catch (error) {
    const detail = errorText(error);
    // Explicit import retries may only accept identical bytes AND original metadata.
    if (/MEDIA_KEY_EXISTS|UNIQUE constraint failed: media_objects\.key/.test(detail)) {
      if (options.import?.duplicate === 'verify') {
        const existing = await getMedia(database, key);
        if (existing && existing.etag === sha256 && existing.size === body.length) {
          const existingMetadata = metadata(existing);
          const actualDigest = await crypto.subtle.digest('SHA-256', existing.body);
          const actualHash = Array.from(new Uint8Array(actualDigest), byte => byte.toString(16).padStart(2, '0')).join('');
          if (actualHash === sha256 && existingMetadata.httpJson === httpJson && existingMetadata.customJson === customJson
              && (existing.sourceEtag ?? null) === sourceEtag && (options.import.uploaded === undefined || existing.uploaded.toISOString() === uploaded))
            return {key, size: body.length, etag: sha256, alreadyPresent: true};
        }
      }
      throw new MediaError('An image with this key already exists; it was not overwritten.', 409);
    }
    if (detail.includes('MEDIA_STORAGE_LIMIT')) throw new MediaError('The free image storage budget is full (100 MiB). No image was saved.', 507);
    throw error;
  }
  return {key, size: body.length, etag: sha256, alreadyPresent: false};
}

/** Read both tables in one consistent transaction, including images unused by any product. */
export async function getMedia(database: D1Database, key: string): Promise<MediaObject | null> {
  validKey(key);
  const [metadataResult, chunksResult] = await database.batch([
    database.prepare('SELECT * FROM media_objects WHERE key=?').bind(key),
    database.prepare('SELECT position,data FROM media_chunks WHERE object_key=? ORDER BY position LIMIT 41').bind(key),
  ]);
  const row = metadataResult.results[0] as unknown as MediaRow | undefined;
  if (!row) return null;
  const chunks = chunksResult.results as unknown as {position: number; data: ArrayBuffer | Uint8Array | number[]}[];
  if (chunks.length !== row.chunk_count) throw new MediaError('Stored image is incomplete.', 503);
  const body = new Uint8Array(row.byte_length);
  for (let position = 0; position < chunks.length; position++) {
    const chunk = asBytes(chunks[position].data), offset = position * MEDIA_CHUNK_BYTES;
    if (chunks[position].position !== position || chunk.length !== Math.min(MEDIA_CHUNK_BYTES, body.length - offset))
      throw new MediaError('Stored image is incomplete.', 503);
    body.set(chunk, offset);
  }
  return {key, size: row.byte_length, body, etag: row.sha256, uploaded: new Date(row.uploaded),
    sourceEtag: row.source_etag ?? undefined, httpMetadata: JSON.parse(row.http_metadata), customMetadata: JSON.parse(row.custom_metadata)};
}

/** Preserve HTTP metadata in storage; only safe raster types can render on the store origin. */
export function mediaHeaders(file: MediaObject): Headers {
  const original = file.httpMetadata;
  const type = original.contentType?.split(';', 1)[0].trim().toLowerCase();
  const safeType = type && ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type);
  const headers = new Headers({'Content-Type': safeType ? type : 'application/octet-stream',
    'Content-Length': String(file.size), 'Cache-Control': 'public,max-age=31536000,immutable',
    'X-Content-Type-Options': 'nosniff', ETag: '"' + file.etag + '"', 'Last-Modified': file.uploaded.toUTCString()});
  const names = {contentLanguage: 'Content-Language', contentDisposition: 'Content-Disposition',
    contentEncoding: 'Content-Encoding', cacheControl: 'Cache-Control'} as const;
  for (const [key, name] of Object.entries(names)) {
    const value = original[key as keyof typeof names];
    if (typeof value === 'string' && !/[\x00-\x1f\x7f]/.test(value)) {
      try { headers.set(name, value); } catch { /* Invalid original headers stay available in stored metadata. */ }
    }
  }
  if (original.cacheExpiry) headers.set('Expires', new Date(original.cacheExpiry).toUTCString());
  if (!safeType) headers.set('Content-Disposition', 'attachment');
  return headers;
}
