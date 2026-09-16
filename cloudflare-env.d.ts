declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ASSETS?: Fetcher;
    BUCKET?: R2Bucket;
    APP_URL?: string;
    SITE_VISIBILITY?: string;
    PREVIEW_ACCESS_USER?: string;
    PREVIEW_ACCESS_PASSWORD?: string;
  }
}
