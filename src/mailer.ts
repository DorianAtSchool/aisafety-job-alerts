import type { WorkerMailer } from "worker-mailer";
import type { EmailMessage } from "./email";
import type { Env } from "./env";

export interface Mailer {
  send(msg: EmailMessage): Promise<void>;
  /** Releases any open connection. Safe to call when nothing was sent. */
  close(): Promise<void>;
}

/** Dry-run mailer: stores messages in the outbox table (view them at /dev/outbox). */
class OutboxMailer implements Mailer {
  constructor(private db: D1Database) {}
  async send(msg: EmailMessage): Promise<void> {
    await this.db
      .prepare("INSERT INTO outbox (to_email, subject, html, text, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(msg.to, msg.subject, msg.html, msg.text, Date.now())
      .run();
  }
  async close(): Promise<void> {}
}

/**
 * Sends through Gmail's SMTP server with an app password. One connection is opened on the first
 * send and reused for the rest of the run, so a daily run costs one outbound connection.
 */
class GmailMailer implements Mailer {
  private conn: Promise<WorkerMailer> | null = null;
  constructor(private user: string, private password: string, private fromName: string) {}

  private connect(): Promise<WorkerMailer> {
    // Imported lazily: it needs the Workers-only `cloudflare:sockets`, which Node-based tests lack.
    this.conn ??= import("worker-mailer").then(({ WorkerMailer }) => WorkerMailer.connect({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      credentials: { username: this.user, password: this.password },
      authType: "plain",
    }));
    return this.conn;
  }

  async send(msg: EmailMessage): Promise<void> {
    const mailer = await this.connect();
    await mailer.send({
      from: { name: this.fromName, email: this.user },
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      headers: msg.headers,
    });
  }

  async close(): Promise<void> {
    if (!this.conn) return;
    const conn = this.conn;
    this.conn = null;
    await (await conn).close().catch(() => {});
  }
}

export function createMailer(env: Env): Mailer {
  switch (env.MAIL_MODE) {
    case "outbox":
      return new OutboxMailer(env.DB);
    case "gmail":
      if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error("MAIL_MODE=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD");
      return new GmailMailer(env.GMAIL_USER, env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""), env.MAIL_FROM_NAME || "AI Safety Job Alerts");
    default:
      throw new Error(`Unknown MAIL_MODE "${env.MAIL_MODE}"`);
  }
}
