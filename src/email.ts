// Email rendering (HTML + plain text). Inline styles only — email clients ignore <style> blocks.
import type { ApiJob } from "./jobs";
import { describeFilters, type Filters } from "./match";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface DigestGroup {
  name: string;
  filters: Filters;
  jobs: ApiJob[];
}

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Same palette as the site (light only: dark-mode support in email clients is too inconsistent).
const C = { bg: "#f6f3ec", surface: "#fffdf8", text: "#1a1916", muted: "#6f6a60", faint: "#a39d91", border: "#e6e0d4", accent: "#ff7a1a", ink: "#1a1916" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"; // single quotes: used inside style="…"

const ATTRIBUTION_TEXT = "Jobs come from AISafety.com (https://aisafety.com/jobs), CC BY 4.0.";
const ATTRIBUTION_HTML =
  `Jobs come from <a href="https://aisafety.com/jobs" style="color:${C.muted};text-decoration:underline">AISafety.com</a> ` +
  `(<a href="https://creativecommons.org/licenses/by/4.0/" style="color:${C.muted};text-decoration:underline">CC BY 4.0</a>).`;

/** "Junior (1–4 years experience), Mid (5–9 years experience)" -> "Junior (1–4 yrs), Mid (5–9 yrs)" */
function shortExperience(s: string): string {
  return s.replace(/ years experience\)/g, " yrs)");
}

/** The same details as a job card on aisafety.com/jobs, as [label, value] pairs. */
function jobDetails(job: ApiJob): [string, string][] {
  const details: [string, string][] = [
    ["Skillset", job.skillSet],
    ["Min experience", shortExperience(job.minimumExperience ?? "")],
    ["Education", job.requiredDegree],
    ["Type", job.roleType],
    ["Salary", job.salary?.replace(/^\$\$/, "$")],
  ];
  return details.filter(([, v]) => Boolean(v));
}

function jobDetailsHtml(job: ApiJob): string {
  return jobDetails(job)
    // Spaced inline-blocks instead of separators, so wrapped lines never start or end with a "|".
    .map(([label, v]) => `<span style="display:inline-block;margin-right:14px"><span style="color:${C.faint}">${label}</span>&nbsp;${esc(v)}</span>`)
    .join(" ");
}

function jobText(job: ApiJob): string {
  return [
    `${job.name} at ${job.organization}`,
    job.location,
    job.summary,
    jobDetails(job).map(([label, v]) => `${label}: ${v}`).join(" · "),
    job.url,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Centered 600px column on a tinted background; tables for layout so Outlook renders it too. */
function shell(preheader: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<style>
/* Progressive enhancement: Gmail, Apple Mail and the preview page apply this; others ignore it and
   show the plain layout. Padding + negative margin let the highlight extend past the text. */
.jl{margin:-10px -12px;padding:10px 12px;border-radius:10px}
.jl:hover{background:${C.bg}}
.jl:hover .jt{color:${C.accent} !important}
</style></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT};color:${C.text}">
<tr><td style="padding:0 4px 16px;font-size:13px;font-weight:650;color:${C.ink}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${C.accent};margin-right:8px;vertical-align:1px"></span>AI Safety Job Alerts</td></tr>
${bodyHtml}
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:${C.muted}">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface DigestLinks {
  manage: string;
  unsubscribe: string;
  shortlist: string;
  /** Page that adds a job to the subscriber's shortlist. */
  save: (jobId: string) => string;
  /** Jobs already on the shortlist (only known for the preview; new jobs in a digest never are). */
  saved?: Set<string>;
}

function logoCell(j: ApiJob): string {
  // Fixed size + background so a blocked or missing image still leaves a tidy square.
  const img = j.logo
    ? `<img src="${esc(j.logo)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:8px;border:1px solid ${C.border};background:#fff;object-fit:contain">`
    : `<div style="width:40px;height:40px;border-radius:8px;background:${C.bg};border:1px solid ${C.border}"></div>`;
  return `<td width="56" valign="top" style="width:56px;padding-top:2px">${img}</td>`;
}

function jobRow(j: ApiJob, first: boolean, links: DigestLinks): string {
  const saved = links.saved?.has(j.id);
  // The whole job (logo, title, details) is one link to the posting. The Save button sits below it,
  // outside that link, because links can't be nested.
  return `<tr><td style="padding:${first ? "4px" : "18px"} 0 18px;${first ? "" : `border-top:1px solid ${C.border};`}">
<a href="${esc(j.url)}" class="jl" style="display:block;color:${C.text};text-decoration:none">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${logoCell(j)}<td valign="top">
<div class="jt" style="font-size:16px;line-height:1.35;font-weight:650;color:${C.ink}">${esc(j.name)}&nbsp;<span style="color:${C.accent}">&rarr;</span></div>
<div style="font-size:14px;line-height:1.45;margin-top:3px;color:${C.text}"><span style="font-weight:600">${esc(j.organization)}</span>${j.location ? `<span style="color:${C.muted}">&nbsp;·&nbsp;${esc(j.location)}</span>` : ""}</div>
${j.summary ? `<div style="font-size:14px;line-height:1.5;margin-top:8px;color:${C.text}">${esc(j.summary)}</div>` : ""}
<div style="font-size:12px;line-height:1.7;margin-top:8px;color:${C.text}">${jobDetailsHtml(j)}</div>
</td></tr></table></a>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="56" style="width:56px"></td><td style="padding-top:12px">
<a href="${esc(links.save(j.id))}" style="display:inline-block;padding:5px 14px 5px 10px;border:1px solid ${C.border};border-radius:999px;background:${C.surface};color:${C.ink};font-size:13px;font-weight:600;line-height:20px;text-decoration:none"><span style="font-size:18px;line-height:20px;vertical-align:-2px;color:${C.accent}">${saved ? "&#9733;" : "&#9734;"}</span>&nbsp;${saved ? "Saved" : "Save"}</a>
</td></tr></table>
</td></tr>`;
}

/** `beforeList` is extra HTML (a table row) placed between the heading and the job list; used by the preview. */
export function renderDigest(groups: DigestGroup[], links: DigestLinks, beforeList = ""): Omit<EmailMessage, "to"> {
  const total = groups.reduce((n, g) => n + g.jobs.length, 0);
  const subject = `AI Safety Jobs Alert: ${total} new ${total === 1 ? "job" : "jobs"}`;
  const shown = groups.filter((g) => g.jobs.length);

  const sections = shown
    .map(
      (g, i) => `<tr><td style="padding:${i === 0 ? "0" : "12px"} 0 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.surface};border:1px solid ${C.border};border-radius:12px">
<tr><td style="padding:18px 24px 14px;border-bottom:1px solid ${C.border}">
<div style="font-size:15px;font-weight:600">${esc(g.name)}<span style="color:${C.accent};font-weight:650">&nbsp;&nbsp;${g.jobs.length}</span></div>
<div style="font-size:12px;color:${C.muted};margin-top:2px">${esc(describeFilters(g.filters))}</div>
</td></tr>
<tr><td style="padding:14px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${g.jobs.map((j, k) => jobRow(j, k === 0, links)).join("")}
</table></td></tr></table></td></tr>`,
    )
    .join("");

  const date = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const heading = `<tr><td style="padding:0 4px 20px">
<div style="font-size:26px;line-height:1.2;font-weight:650;letter-spacing:-.02em">${total} new ${total === 1 ? "job" : "jobs"}</div>
<div style="font-size:14px;color:${C.muted};margin-top:4px">${esc(date)}</div></td></tr>`;

  const preheader = shown.flatMap((g) => g.jobs).slice(0, 3).map((j) => `${j.name} at ${j.organization}`).join(" · ");
  const footerHtml = `<a href="${esc(links.manage)}" style="color:${C.muted};text-decoration:underline">Change your filters</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${esc(links.shortlist)}" style="color:${C.muted};text-decoration:underline">Your shortlist</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${esc(links.unsubscribe)}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a><br>${ATTRIBUTION_HTML}`;

  const text =
    groups
      .filter((g) => g.jobs.length)
      .map(
        (g) =>
          `== ${g.name} (${g.jobs.length}) ==\n${describeFilters(g.filters)}\n\n` +
          g.jobs.map((j) => jobText(j) + "\n").join("\n"),
      )
      .join("\n") +
    `\n--\n${ATTRIBUTION_TEXT}\nChange your filters: ${links.manage}\nUnsubscribe: ${links.unsubscribe}\n`;

  return {
    subject,
    html: shell(preheader, heading + beforeList + sections, footerHtml),
    text,
    headers: {
      "List-Unsubscribe": `<${links.unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export function renderConfirmation(confirmUrl: string): Omit<EmailMessage, "to"> {
  const subject = "Confirm your email for AI Safety Job Alerts";
  const html = shell(
    "One click and you're in.",
    `<tr><td style="background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:28px 24px">
<div style="font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.02em">One click and you're in</div>
<p style="font-size:15px;line-height:1.55;margin:10px 0 22px">Hit the button to confirm it's you, then pick which jobs you want to hear about.</p>
<a href="${esc(confirmUrl)}" style="display:inline-block;background:${C.ink};color:${C.surface};font-size:15px;font-weight:600;padding:11px 20px;border-radius:8px;text-decoration:none">Confirm &amp; pick filters</a>
<p style="font-size:13px;line-height:1.5;color:${C.muted};margin:22px 0 0">Didn't sign up? Just ignore this and you won't hear from us again.</p>
</td></tr>`,
    ATTRIBUTION_HTML,
  );
  const text = `One click and you're in.\n\nConfirm and pick your filters: ${confirmUrl}\n\nDidn't sign up? Just ignore this.\n`;
  return { subject, html, text };
}
