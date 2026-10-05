declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    PASSWORD_KDF?: import('./lib/password-kdf').PasswordKdfNamespace;
    ASSETS?: Fetcher;
    APP_URL?: string;
    SITE_VISIBILITY?: string;
    PREVIEW_ACCESS_USER?: string;
    PREVIEW_ACCESS_PASSWORD?: string;
  }
}
