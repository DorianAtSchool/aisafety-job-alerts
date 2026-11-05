export interface Env {
  DB: D1Database;
  /** Public origin used in email links, e.g. https://aisafety-job-alerts.example.workers.dev */
  BASE_URL: string;
  MAIL_MODE: "outbox" | "gmail";
  /** Comma-separated emails allowed to sign up while SIGNUP_OPEN is "false" (secret: keeps addresses out of the repo). */
  ALLOWED_EMAILS?: string;
  SIGNUP_OPEN: string;
  MAX_EMAILS_PER_RUN: string;
  /** Gmail address to send from (MAIL_MODE=gmail). */
  GMAIL_USER?: string;
  /** Secret: a Google app password for GMAIL_USER (spaces are ignored). */
  GMAIL_APP_PASSWORD?: string;
  MAIL_FROM_NAME?: string;
  /** Where failure alerts from the daily run go (secret, so it stays out of the public repo). Defaults to GMAIL_USER. */
  ALERT_EMAIL?: string;
  /** Turnstile bot check on sign-up forms: public site key (var) + secret (secret). Off when unset. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Secret: enables POST /admin/run (Authorization: Bearer <key>) to trigger the daily run. */
  ADMIN_KEY?: string;
  /** "true" only in .dev.vars: enables /dev/* routes and open sign-up. */
  DEV?: string;
}
