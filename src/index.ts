import {
  addToShortlist,
  confirmSubscriber,
  deleteSearch,
  deleteSubscriber,
  jobById,
  markLinkSent,
  removeFromShortlist,
  saveSearch,
  searchByShareCode,
  searchesFor,
  shortlistFor,
  subscriberByEmail,
  subscriberByToken,
  upsertSubscriber,
} from "./db";
import { esc, renderConfirmation, renderDigest, renderManageLink } from "./email";
import type { Env } from "./env";
import { createMailer, type Mailer } from "./mailer";
import { filtersFromForm, matches } from "./match";
import {
  homePage,
  lostLinkPage,
  managePage,
  messagePage,
  outboxPage,
  savePage,
  searchEditorPage,
  sharePage,
  shortlistPage,
  unsubscribePage,
} from "./pages";
import { presetByKey } from "./presets";
import { buildDigestGroups, dailyRun, ensureJobs, manageLinks, type RunReport } from "./run";
import { verifyTurnstile } from "./turnstile";

const DAY = 24 * 60 * 60 * 1000;

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
}

function json(data: unknown): Response {
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}

function signupAllowed(env: Env, email?: string): boolean {
  if (env.SIGNUP_OPEN === "true" || env.DEV === "true") return true;
  if (!email) return false;
  const allowed = (env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  return allowed.includes(email);
}

/** Whether to show the sign-up form at all (open sign-up, or an invite list exists). */
function showSignup(env: Env): boolean {
  return signupAllowed(env) || (env.ALLOWED_EMAILS ?? "").trim() !== "";
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
}

function sendFailedPage(opts: { token?: string } = {}): Response {
  const res = messagePage(
    "Couldn't send the email",
    `<p style="margin:0">Our email sender is having trouble right now. Give it a few minutes and try again.</p>`,
    opts,
  );
  return new Response(res.body, { status: 502, headers: res.headers });
}

const BAD_LINK = `<p style="margin:0">This link has expired or was already used. <a href="/">Sign up again?</a></p>`;

/** Handles a sign-up form post. `share` is a share code whose search gets copied on confirmation. */
async function subscribe(req: Request, env: Env, share?: string): Promise<Response> {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return messagePage("Hmm", `<p style="margin:0">That email doesn't look right. <a href="javascript:history.back()">Try again?</a></p>`);
  }
  const human = await verifyTurnstile(
    env.TURNSTILE_SECRET,
    form.get("cf-turnstile-response") as string | null,
    req.headers.get("cf-connecting-ip"),
  );
  if (!human) {
    return messagePage("Quick check failed", `<p style="margin:0">We couldn't confirm you're not a bot. <a href="javascript:history.back()">Go back and try again?</a></p>`);
  }
  // Same response whether or not the address is allowed/known, so the form can't be used to probe.
  const done = messagePage("Check your email", `<p style="margin:0">If sign-ups are open for that address, a confirmation link is on its way.</p>`);
  if (!signupAllowed(env, email)) return done;
  const sub = await upsertSubscriber(env.DB, email, Date.now());
  // Already confirmed: nothing to send. The page looks the same either way, so the form doesn't
  // reveal who's subscribed. (A shared-search sign-up still emails: confirming adds that search.)
  if (sub.confirmed_at !== null && !share) return done;
  const confirmPath = `/confirm/${sub.token}${share ? `?share=${encodeURIComponent(share)}` : ""}`;
  const mailer = createMailer(env);
  try {
    await mailer.send({ to: email, ...renderConfirmation(`${env.BASE_URL.replace(/\/$/, "")}${confirmPath}`) });
  } catch (err) {
    console.error("confirmation email failed", err);
    return sendFailedPage();
  } finally {
    await mailer.close();
  }
  if (env.DEV === "true") {
    return messagePage("Check your email", `<p style="margin:0">Dev mode: the email is in the <a href="/dev/outbox">outbox</a>, or just <a href="${confirmPath}">confirm here</a>.</p>`);
  }
  return done;
}

const LINK_RESEND_GAP = 10 * 60 * 1000;

/** "Lost your link?": emails the private manage link, but only to confirmed subscribers and at most every 10 minutes. */
async function sendManageLink(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const human = await verifyTurnstile(env.TURNSTILE_SECRET, form.get("cf-turnstile-response") as string | null, req.headers.get("cf-connecting-ip"));
  if (!human) {
    return messagePage("Quick check failed", `<p style="margin:0">We couldn't confirm you're not a bot. <a href="/link">Try again?</a></p>`);
  }
  // Same page whatever happens, so this form can't be used to find out who's subscribed.
  const done = messagePage("Check your email", `<p style="margin:0">If that address has alerts set up, we've sent it the link.</p>`);
  const sub = await subscriberByEmail(env.DB, email);
  const now = Date.now();
  if (!sub || sub.confirmed_at === null || (sub.link_sent_at !== null && now - sub.link_sent_at < LINK_RESEND_GAP)) return done;
  const mailer = createMailer(env);
  try {
    await mailer.send({ to: sub.email, ...renderManageLink(manageLinks(env, sub.token).manage) });
  } catch (err) {
    console.error("manage-link email failed", err);
    return sendFailedPage();
  } finally {
    await mailer.close();
  }
  await markLinkSent(env.DB, sub.id, now);
  return done;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "") || "/";
  const method = req.method;
  const parts = path.split("/").filter(Boolean);

  if (path === "/" && method === "GET") {
    return homePage(showSignup(env), (await ensureJobs(env)).length, env.TURNSTILE_SITE_KEY);
  }

  if (path === "/subscribe" && method === "POST") return subscribe(req, env);

  if (path === "/link") {
    if (method === "GET") return lostLinkPage(env.TURNSTILE_SITE_KEY);
    if (method === "POST") return sendManageLink(req, env);
  }

  // Shared searches: /s/<code> shows matches and a sign-up form that copies the search.
  if (parts[0] === "s" && parts.length === 2) {
    const search = await searchByShareCode(env.DB, parts[1]);
    if (!search) return messagePage("Link doesn't work", `<p style="margin:0">That shared search doesn't exist anymore. <a href="/">Make your own?</a></p>`);
    if (method === "POST") return subscribe(req, env, parts[1]);
    const jobs = (await ensureJobs(env)).filter((j) => matches(search.filters, j));
    const since = daysAgoIso(30);
    const open = showSignup(env);
    return sharePage(search, jobs, jobs.filter((j) => (j.datePublished ?? "") >= since).length, open, parts[1], env.TURNSTILE_SITE_KEY);
  }

  if (parts[0] === "confirm" && parts.length === 2 && method === "GET") {
    const sub = await subscriberByToken(env.DB, parts[1]);
    if (!sub) return messagePage("Link doesn't work", BAD_LINK);
    await confirmSubscriber(env.DB, sub.id, Date.now());
    const shared = url.searchParams.get("share");
    const search = shared ? await searchByShareCode(env.DB, shared) : null;
    if (search) {
      const existing = await searchesFor(env.DB, sub.id);
      const same = existing.some((s) => s.name === search.name && JSON.stringify(s.filters) === JSON.stringify(search.filters));
      if (!same && existing.length < 20) await saveSearch(env.DB, sub.id, null, search.name, search.filters, Date.now());
    }
    return redirect(`/manage/${sub.token}`);
  }

  if (parts[0] === "unsubscribe" && parts.length === 2) {
    const sub = await subscriberByToken(env.DB, parts[1]);
    if (!sub) return messagePage("Already gone", `<p style="margin:0">You're not subscribed, so nothing to do here.</p>`);
    // GET only shows a button: link scanners in mail clients prefetch GETs.
    if (method === "GET") return unsubscribePage(sub.token, sub.email);
    await deleteSubscriber(env.DB, sub.id);
    return messagePage("You're unsubscribed", `<p style="margin:0">No more emails, and your searches are deleted. <a href="/">Changed your mind?</a></p>`);
  }

  if (parts[0] === "manage" && parts.length >= 2) {
    const sub = await subscriberByToken(env.DB, parts[1]);
    if (!sub) return messagePage("Link doesn't work", BAD_LINK);
    const base = `/manage/${sub.token}`;
    const rest = parts.slice(2);

    if (rest.length === 0 && method === "GET") return managePage(sub, await searchesFor(env.DB, sub.id));

    if (rest[0] === "preview" && (method === "GET" || method === "POST")) {
      const since = daysAgoIso(7);
      const recent = (await ensureJobs(env)).filter((j) => (j.datePublished ?? "") >= since);
      const groups = buildDigestGroups(await searchesFor(env.DB, sub.id), recent);
      if (!groups.some((g) => g.jobs.length)) {
        return messagePage("Nothing to preview", `<p style="margin:0">None of your searches matched anything from the past week.</p>`, { token: sub.token });
      }
      const saved = new Set((await shortlistFor(env.DB, sub.id)).map((e) => e.job.id));
      // "Email it to me": sends this exact digest to the subscriber's own address, nobody else's.
      if (method === "POST") {
        const mailer = createMailer(env);
        try {
          await mailer.send({ to: sub.email, ...renderDigest(groups, { ...manageLinks(env, sub.token), saved }) });
        } catch (err) {
          console.error("preview email failed", err);
          return sendFailedPage({ token: sub.token });
        } finally {
          await mailer.close();
        }
        return redirect(`${base}/preview?sent=1`);
      }
      const back = `<tr><td style="padding:0 4px 16px"><a href="${base}" style="display:inline-block;padding:7px 14px;border-radius:999px;border:1px solid #e6e0d4;background:#fffdf8;color:#1a1916;font-size:13px;font-weight:600;text-decoration:none">← Your alerts</a><form method="post" action="${base}/preview" style="display:inline;margin:0 0 0 8px"><button style="padding:7px 14px;border-radius:999px;border:1px solid #1a1916;background:#1a1916;color:#fffdf8;font:600 13px -apple-system,'Segoe UI',Roboto,sans-serif;cursor:pointer">${url.searchParams.has("sent") ? `Sent to ${esc(sub.email)} ✓` : "Email it to me"}</button></form><span style="font-size:13px;color:#a39d91;margin-left:10px">Preview using jobs from the past week</span></td></tr>`;
      const { html } = renderDigest(groups, { ...manageLinks(env, sub.token), saved }, back);
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (rest[0] === "search" && rest.length === 2) {
      const searches = await searchesFor(env.DB, sub.id);
      const isNew = rest[1] === "new";
      const search = isNew ? null : searches.find((s) => String(s.id) === rest[1]);
      if (!isNew && !search) return redirect(base);
      if (method === "GET") {
        return searchEditorPage(sub, search ?? null, await ensureJobs(env), isNew ? presetByKey(url.searchParams.get("preset")) : undefined);
      }
      if (method === "POST") {
        if (isNew && searches.length >= 20) return messagePage("That's a lot of searches", `<p style="margin:0">20 is the max.</p>`, { token: sub.token });
        const form = await req.formData();
        const name = String(form.get("name") ?? "").trim().slice(0, 80) || "My search";
        await saveSearch(env.DB, sub.id, search?.id ?? null, name, filtersFromForm(form), Date.now());
        return redirect(base);
      }
    }

    if (rest[0] === "shortlist" && rest.length === 1 && method === "GET") {
      return shortlistPage(sub, await shortlistFor(env.DB, sub.id));
    }

    if (rest[0] === "shortlist" && rest[2] === "remove" && method === "POST") {
      await removeFromShortlist(env.DB, sub.id, rest[1]);
      return redirect(`${base}/shortlist`);
    }

    // Email "Save for later" links land here. GET only renders; the page's JS POSTs, so mail
    // scanners that prefetch links don't fill the shortlist.
    if (rest[0] === "save" && rest.length === 2) {
      const found = await jobById(env.DB, rest[1]);
      if (!found) return messagePage("Can't find that job", `<p style="margin:0">It may have been removed from the board.</p>`, { token: sub.token });
      if (method === "POST") {
        await addToShortlist(env.DB, sub.id, found.job.id, Date.now());
        // The <noscript> form posts as a normal navigation; the JS fetch doesn't ask for HTML.
        return (req.headers.get("accept") ?? "").includes("text/html") ? redirect(`${base}/shortlist`) : json({ ok: true });
      }
      return savePage(sub, found.job);
    }

    if (rest[0] === "search" && rest[2] === "delete" && method === "POST") {
      await deleteSearch(env.DB, sub.id, Number(rest[1]));
      return redirect(base);
    }
  }

  if (path === "/api/count" && method === "POST") {
    const filters = filtersFromForm(await req.formData());
    const since = daysAgoIso(30);
    const matched = (await ensureJobs(env)).filter((j) => matches(filters, j));
    return json({
      total: matched.length,
      recent: matched.filter((j) => (j.datePublished ?? "") >= since).length,
      sample: matched.slice(0, 8).map((j) => ({ name: j.name, organization: j.organization, logo: j.logo, url: j.url, datePublished: j.datePublished })),
    });
  }

  // Trigger the daily run on demand in production (e.g. to test a deploy without waiting for 09:00 UTC).
  if (path === "/admin/run" && method === "POST") {
    const auth = req.headers.get("authorization") ?? "";
    if (!env.ADMIN_KEY || auth !== `Bearer ${env.ADMIN_KEY}`) return new Response("Not found", { status: 404 });
    return json(await dailyRun(env));
  }

  if (parts[0] === "dev" && env.DEV === "true") {
    if (path === "/dev/outbox" && method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, to_email, subject, created_at FROM outbox ORDER BY id DESC LIMIT 100").all<{
        id: number; to_email: string; subject: string; created_at: number;
      }>();
      return outboxPage(results);
    }
    if (parts[1] === "outbox" && parts.length === 3) {
      const row = await env.DB.prepare("SELECT html, text FROM outbox WHERE id = ?").bind(Number(parts[2])).first<{ html: string; text: string }>();
      if (!row) return redirect("/dev/outbox");
      return url.searchParams.has("text")
        ? new Response(row.text, { headers: { "content-type": "text/plain; charset=utf-8" } })
        : new Response(row.html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (path === "/dev/run" && method === "POST") {
      return json(await dailyRun(env));
    }
    if (path === "/dev/reset" && method === "POST") {
      const days = Math.max(0, Math.min(60, Number((await req.formData()).get("days")) || 3));
      const since = daysAgoIso(days);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sent WHERE job_id IN (SELECT id FROM jobs WHERE date_published >= ?)").bind(since),
        env.DB.prepare("DELETE FROM jobs WHERE date_published >= ?").bind(since),
      ]);
      return redirect("/dev/outbox");
    }
  }

  return new Response("Not found", { status: 404 });
}

/** Emails ALERT_EMAIL when the daily run fails or partly fails. If Gmail itself is the problem this
 *  can't get through either, so the error is also in the logs (`wrangler tail` / dashboard). */
async function sendAlert(env: Env, report: RunReport | null, failure: unknown): Promise<void> {
  const to = env.ALERT_EMAIL || env.GMAIL_USER;
  if (!to) return;
  const lines = failure
    ? [`The daily run crashed: ${failure instanceof Error ? failure.message : String(failure)}`]
    : [
        `The daily run finished with problems.`,
        `Emails sent: ${report!.emailsSent}, failed: ${report!.errors.length}, skipped by the daily cap: ${report!.skippedByCap}.`,
        ...report!.errors.slice(0, 20).map((e) => `- ${e}`),
      ];
  const text = `${lines.join("\n")}\n\nLogs: npx wrangler tail, or the Cloudflare dashboard.\n`;
  let mailer: Mailer | null = null;
  try {
    // Inside the try: a bad mail config must not turn a failed run into an unhandled crash.
    mailer = createMailer(env);
    await mailer.send({
      to,
      subject: "AI Safety Job Alerts: daily run had a problem",
      text,
      html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${esc(text)}</pre>`,
    });
  } catch (err) {
    console.error("alert email failed too", err);
  } finally {
    await mailer?.close();
  }
}

export default {
  async fetch(req, env) {
    try {
      return await handle(req, env);
    } catch (err) {
      console.error(err);
      const res = messagePage("Something broke", `<p style="margin:0">That's on us, not you. Try again in a bit.</p>`);
      return new Response(res.body, { status: 500, headers: res.headers });
    }
  },
  async scheduled(_event, env) {
    let report: RunReport | null = null;
    let failure: unknown = null;
    try {
      report = await dailyRun(env);
      console.log(JSON.stringify(report));
    } catch (err) {
      failure = err;
      console.error("daily run failed", err);
    }
    if (failure || report?.errors.length || report?.skippedByCap) await sendAlert(env, report, failure);
  },
} satisfies ExportedHandler<Env>;
