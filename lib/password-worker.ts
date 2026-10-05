import {DurableObject} from 'cloudflare:workers';
import {Buffer} from 'node:buffer';
import {randomBytes, scryptSync, timingSafeEqual} from 'node:crypto';
import {validPasswordHash, validPasswordInput} from './password-kdf';

// Keep every parameter and salt encoding identical to the original auth.ts.
// Salt is the 32-character hex STRING, not the bytes decoded from that string.
const SCRYPT_OPTIONS = Object.freeze({N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024});
const HASH_PREFIX = 'scrypt:32768:8:3:';

/** Private RPC only. Register using a new_sqlite_classes migration for Free. */
export class PasswordKdf extends DurableObject {
  async hashPassword(password: string): Promise<string> {
    if (!validPasswordInput(password)) throw new TypeError('Password must be a string of at most 1024 characters.');
    const salt = randomBytes(16).toString('hex');
    const key = scryptSync(password, salt, 32, SCRYPT_OPTIONS);
    try {
      return HASH_PREFIX + salt + ':' + key.toString('hex');
    } finally {
      key.fill(0);
    }
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    // Reject malformed/unsupported formats before decoding or allocating KDF
    // memory. Parameters are fixed; the stored string cannot increase cost.
    if (!validPasswordInput(password) || !validPasswordHash(stored)) return false;
    const parts = stored.split(':');
    const key = scryptSync(password, parts[4], 32, SCRYPT_OPTIONS);
    const saved = Buffer.from(parts[5], 'hex');
    try {
      return timingSafeEqual(saved, key);
    } finally {
      key.fill(0);
      saved.fill(0);
    }
  }
}
