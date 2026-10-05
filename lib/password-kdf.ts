import type {PasswordKdf} from './password-worker';

export const MAX_PASSWORD_LENGTH = 1024;
const HASH_PATTERN = /^scrypt:32768:8:3:[0-9a-f]{32}:[0-9a-f]{64}$/;
const HASH_LENGTH = 114;

export function validPasswordInput(password: unknown): password is string {
  // Match the application's string-length limit. Do not trim or normalize:
  // existing hashes derive from the original UTF-8 encoding of the password.
  return typeof password === 'string' && password.length <= MAX_PASSWORD_LENGTH;
}

export function validPasswordHash(stored: unknown): stored is string {
  return typeof stored === 'string' && stored.length === HASH_LENGTH && HASH_PATTERN.test(stored);
}

export type PasswordKdfNamespace = DurableObjectNamespace<PasswordKdf>;

function passwordService(namespace: PasswordKdfNamespace | undefined) {
  if (!namespace) throw new Error('Password service is unavailable. Please try again shortly.');
  // Password work is stateless: a fresh random object avoids serializing every
  // account behind one hot object. No password, hash, or object ID is persisted.
  return namespace.get(namespace.newUniqueId());
}

export async function hashPasswordWithKdf(namespace: PasswordKdfNamespace | undefined, password: string): Promise<string> {
  if (!validPasswordInput(password)) throw new TypeError('Password must be a string of at most 1024 characters.');
  // Deliberately no local derivation fallback: Workers Free HTTP requests have
  // insufficient CPU for this KDF. The SQLite Durable Object has its own budget.
  return passwordService(namespace).hashPassword(password);
}

export async function verifyPasswordWithKdf(namespace: PasswordKdfNamespace | undefined, password: string, stored: string): Promise<boolean> {
  if (!validPasswordInput(password) || !validPasswordHash(stored)) return false;
  return passwordService(namespace).verifyPassword(password, stored);
}
