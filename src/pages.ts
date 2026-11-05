// Server-rendered HTML pages. A little vanilla JS powers the live match count, copy-link and save buttons.
import type { Search, ShortlistEntry, Subscriber } from "./db";
import { esc } from "./email";
import { facetValues, type ApiJob, type FacetKey } from "./jobs";
import { describeFilters, EMPTY_FILTERS, type Filters } from "./match";
import { PRESETS, type Preset } from "./presets";

const CSS = `
/* Warm paper + ink, one bright orange accent. Primary actions are ink; orange is for small highlights. */
:root{--bg:#f6f3ec;--surface:#fffdf8;--text:#1a1916;--muted:#6f6a60;--faint:#a39d91;--border:#e6e0d4;--ink:#1a1916;--on-ink:#fffdf8;--ink-hover:#3a3833;--accent:#ff7a1a;--danger:#c4320a;--ring:rgba(255,122,26,.35)}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--surface:#1c1b18;--text:#f2efe8;--muted:#a8a296;--faint:#77736a;--border:#2e2c27;--ink:#f2efe8;--on-ink:#141311;--ink-hover:#d9d5cc;--accent:#ff8a33;--danger:#ff7a52;--ring:rgba(255,138,51,.4)}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--text);text-decoration:underline;text-decoration-color:var(--faint);text-underline-offset:2px}a:hover{text-decoration-color:var(--accent)}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}.wrap.wide{max-width:1040px}
header.top{border-bottom:1px solid var(--border);background:var(--surface)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:56px}
.brand{display:flex;align-items:center;gap:10px;font-weight:650;color:var(--text);letter-spacing:-.01em;text-decoration:none;white-space:nowrap}
.mark{width:10px;height:10px;border-radius:50%;background:var(--accent)}
nav{display:flex;gap:4px}
nav a{padding:6px 10px;border-radius:8px;font-size:14px;color:var(--muted);text-decoration:none;white-space:nowrap}
nav a:hover{color:var(--text);background:var(--bg)}
nav a.on{color:var(--text);background:var(--bg);font-weight:600}
main{padding:40px 0 56px}
footer{border-top:1px solid var(--border);padding:20px 0 32px;color:var(--faint);font-size:13px}footer a{color:var(--muted)}
h1{font-size:28px;line-height:1.2;letter-spacing:-.02em;font-weight:650;margin:0 0 8px}
h2{font-size:16px;font-weight:600;margin:0}
h3{font-size:15px;font-weight:600;margin:0 0 12px}
.lead{color:var(--muted);margin:0 0 28px;font-size:16px}
.muted{color:var(--muted)}.small{font-size:13px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}
.stack>*+*{margin-top:12px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 16px;border-radius:8px;border:1px solid transparent;background:var(--ink);color:var(--on-ink);font:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none}
.btn:hover{background:var(--ink-hover)}
.btn.ghost{background:var(--surface);color:var(--text);border-color:var(--border)}.btn.ghost:hover{background:var(--surface);border-color:var(--text)}
.btn.sm{height:32px;padding:0 12px;font-size:13px}
.btn.block{width:100%}
.textbtn{background:none;border:0;padding:0;font:inherit;font-size:13px;color:var(--muted);cursor:pointer;text-decoration:none}.textbtn:hover{color:var(--danger)}
.btn.danger{background:var(--danger);color:#fff}.btn.danger:hover{background:var(--danger);opacity:.9}
input[type=text],input[type=email]{width:100%;height:40px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit}
input::placeholder{color:var(--faint)}
input:focus,.btn:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
.list{padding:0}.list>.item{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 20px}.list>.item+.item{border-top:1px solid var(--border)}
.item .desc{color:var(--muted);font-size:13px;margin-top:2px}
.section{padding:20px 0;border-top:1px solid var(--border)}.section:first-child{padding-top:0;border-top:0}.section:last-child{padding-bottom:0}
.label{display:block;font-weight:600;font-size:14px;margin-bottom:10px}
.hint{color:var(--muted);font-size:13px;margin:8px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font-size:13.5px;cursor:pointer;user-select:none;text-decoration:none}
.chip:hover{border-color:var(--faint)}
.chip input{position:absolute;opacity:0;pointer-events:none}
.chip .n{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums}
.chip:has(input:checked),.chip.on{background:var(--ink);border-color:var(--ink);color:var(--on-ink)}
.chip:has(input:checked) .n{color:var(--accent)}
.chip:has(input:focus-visible){box-shadow:0 0 0 3px var(--ring)}
.check{display:flex;gap:8px;align-items:center;font-size:14px;margin-top:12px;cursor:pointer}.check input{accent-color:var(--ink);width:16px;height:16px;margin:0}
.editor{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px;align-items:start}
.side{position:sticky;top:16px;display:grid;gap:12px}
.count{font-size:44px;font-weight:700;letter-spacing:-.03em;line-height:1;margin:6px 0 6px;font-variant-numeric:tabular-nums}
.sample{list-style:none;padding:0;margin:16px 0 0}.sample li{display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--border);font-size:13px;line-height:1.4}
.sample a{color:var(--text);font-weight:550;text-decoration:none}.sample a:hover{color:var(--accent)}.sample span{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.logo{flex:none;width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;object-fit:contain}
.logo.lg{width:40px;height:40px;border-radius:8px}
.backbtn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px 0 10px;margin-bottom:20px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font-size:13px;font-weight:550;text-decoration:none}
.backbtn:hover{border-color:var(--text)}
.points{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px;color:var(--muted);font-size:14px}
.points li{display:flex;gap:10px}.points li:before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--accent);margin-top:8px}
/* Whole row is clickable: the title link stretches over it; buttons sit above that layer. */
.job{position:relative;display:flex;gap:14px;padding:18px 20px;transition:background .15s}.job+.job{border-top:1px solid var(--border)}
.job:hover{background:var(--bg)}.job:first-child{border-radius:12px 12px 0 0}.job:last-child{border-radius:0 0 12px 12px}.job:only-child{border-radius:12px}
.job .t:after{content:"";position:absolute;inset:0}
.job form,.job .btn{position:relative;z-index:1}
.job .t{font-weight:650;font-size:16px;color:var(--text);text-decoration:none}.job:hover .t{color:var(--accent)}
.job .o{font-size:14px;margin-top:2px}.job .o span{color:var(--muted)}
.job .d{font-size:12px;color:var(--muted);margin-top:8px}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg);border:1px solid var(--border);color:var(--muted);vertical-align:2px;margin-left:6px}
@media (max-width:820px){.editor{grid-template-columns:minmax(0,1fr)}.side{position:static}@media (max-width:520px){.job{flex-wrap:wrap}main{padding:28px 0 40px}h1{font-size:24px}.list>.item{flex-direction:column;align-items:flex-start}`;

type NavKey = "alerts" | "shortlist";

interface PageOpts {
  wide?: boolean;
  /** Subscriber token: shows "Your alerts" and "Shortlist" in the header. */
  token?: string;
  active?: NavKey;
}

function page(title: string, body: string, opts: PageOpts = {}): Response {
  const wrap = opts.wide ? "wrap wide" : "wrap";
  const link = (key: NavKey, href: string, label: string) =>
    `<a href="${href}"${opts.active === key ? ' class="on" aria-current="page"' : ""}>${label}</a>`;
  const nav = [
    opts.token ? link("alerts", `/manage/${opts.token}`, "Your alerts") : "",
    opts.token ? link("shortlist", `/manage/${opts.token}/shortlist`, "Shortlist") : "",
  ].join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<header class="top"><div class="${wrap}"><a class="brand" href="${opts.token ? `/manage/${opts.token}` : "/"}"><span class="mark"></span><span class="name">AI Safety Job Alerts</span></a><nav>${nav}</nav></div></header>
<main><div class="${wrap}">${body}</div></main>
<footer><div class="${wrap}">Jobs come from <a href="https://aisafety.com/jobs">AISafety.com</a> (CC BY 4.0). This is a side project, not run by them. · <a href="/privacy">Privacy</a></div></footer>
</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function backButton(token: string): string {
  return `<a class="backbtn" href="/manage/${token}">← Your alerts</a>`;
}

function logo(j: { logo?: string }, cls = "logo"): string {
  return j.logo ? `<img class="${cls}" src="${esc(j.logo)}" alt="" loading="lazy">` : `<span class="${cls}"></span>`;
}

function shortExperience(s: string): string {
  return s.replace(/ years experience\)/g, " yrs)");
}

/** A job row with logo. `badge` goes after the title, `after` below the details, `actions` on the right. */
function jobItem(j: ApiJob, badge = "", after = "", actions = ""): string {
  const details = [j.skillSet, shortExperience(j.minimumExperience ?? ""), j.roleType, j.salary?.replace(/^\$\$/, "$")]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  return `<div class="job">${logo(j, "logo lg")}<div style="min-width:0;flex:1">
<a class="t" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.name)}</a>${badge}
<div class="o"><strong>${esc(j.organization)}</strong>${j.location ? ` <span>· ${esc(j.location)}</span>` : ""}</div>
<div class="d">${details}</div>${after}</div>${actions ? `<div class="row" style="flex:none;align-self:center">${actions}</div>` : ""}</div>`;
}

export function messagePage(title: string, html: string, opts: PageOpts = {}): Response {
  return page(title, `${opts.token ? backButton(opts.token) : ""}<h1>${esc(title)}</h1><div class="card stack" style="margin-top:20px">${html}</div>`, opts);
}

/** Sign-up form; with a Turnstile site key it includes Cloudflare's bot check (usually invisible). */
function signupForm(action: string, button: string, siteKey?: string): string {
  const turnstile = siteKey
    ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}" data-theme="auto" data-size="flexible" data-refresh-expired="auto" style="width:100%"></div>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
// The invisible check needs a moment after page load, and its token expires after ~5 min.
// If someone submits before a fresh token exists, wait for it instead of failing on the server.
document.currentScript.closest('form').addEventListener('submit', function (e) {
  var form = this;
  // Turnstile adds this hidden field itself once it loads, so look it up fresh each time.
  var token = function () { var f = form.querySelector('[name="cf-turnstile-response"]'); return f && f.value; };
  if (token()) return;
  e.preventDefault();
  var btn = form.querySelector('button'), label = btn.textContent, waited = 0;
  btn.disabled = true; btn.textContent = 'One sec…';
  if (window.turnstile) try { turnstile.reset(form.querySelector('.cf-turnstile')); } catch (_) {}
  var t = setInterval(function () {
    waited += 250;
    if (token()) { clearInterval(t); form.submit(); }
    else if (waited > 10000) { clearInterval(t); btn.disabled = false; btn.textContent = label; form.submit(); }
  }, 250);
});
</script>`
    : "";
  return `<form method="post" action="${action}" class="row">
  <input type="email" name="email" required placeholder="you@example.com" style="flex:1;min-width:220px" autocomplete="email" aria-label="Email address">
  <button class="btn">${button}</button>${turnstile}</form>${siteKey ? `<p class="small muted" style="margin:8px 0 0">Protected by Cloudflare Turnstile. See our <a href="/privacy">privacy page</a>.</p>` : ""}`;
}

export function homePage(signupAllowed: boolean, jobCount: number, siteKey?: string): Response {
  return page(
    "AI Safety Job Alerts",
    `<h1>AI safety jobs, straight to your inbox</h1>
<p class="lead">Pick the kinds of roles you care about and get a short email when new ones go up on <a href="https://aisafety.com/jobs">AISafety.com/jobs</a>. There are ${jobCount} open right now.</p>
<div class="card">${
      signupAllowed
        ? `${signupForm("/subscribe", "Sign me up", siteKey)}
<p class="small muted" style="margin:10px 0 0">You'll get a link to confirm, then you pick your filters.</p>`
        : `<p style="margin:0">Sign-ups are closed for now while I test things out.</p>`
    }</div>
<p class="small muted" style="margin:12px 0 0">Already signed up? <a href="/link">Get your link</a></p>
<ul class="points">
<li>Filter by skills, experience, location, degree, org or keywords</li>
<li>At most one email a day (09:00 UTC), and only when there's something new</li>
<li>Save jobs to a shortlist straight from the email</li>
</ul>`,
  );
}

function presetChips(base: string, current?: string): string {
  return PRESETS.map(
    (p) => `<a class="chip${p.key === current ? " on" : ""}" href="${base}/search/new?preset=${p.key}">${esc(p.name)}</a>`,
  ).join("");
}

export function managePage(sub: Subscriber, searches: Search[]): Response {
  const base = `/manage/${sub.token}`;
  const list = searches.length
    ? `<div class="card list">${searches
        .map(
          (s) => `<div class="item">
  <div style="min-width:0"><h2>${esc(s.name)}</h2><div class="desc">${esc(describeFilters(s.filters))}</div></div>
  <div class="row" style="flex:none"><a class="btn ghost sm" href="${base}/search/${s.id}">Edit</a>
  <button type="button" class="btn ghost sm" data-share="/s/${esc(s.share_code)}">Share</button>
  <form method="post" action="${base}/search/${s.id}/delete" onsubmit="return confirm('Delete this search?')"><button class="textbtn">Delete</button></form></div>
</div>`,
        )
        .join("")}</div>`
    : `<div class="card"><p style="margin:0 0 14px">Nothing here yet. Start from one of these, or build your own:</p><div class="chips">${presetChips(base)}</div></div>`;
  return page(
    "Your alerts",
    `<h1>Your alerts</h1>
<p class="lead">Going to <strong style="color:var(--text);font-weight:600">${esc(sub.email)}</strong>. You'll hear from us at 09:00 UTC on days with new matches.</p>
${list}
<div class="row" style="margin-top:16px"><a class="btn" href="${base}/search/new">New search</a>
<a class="btn ghost" href="${base}/preview">Preview email</a></div>
<p class="small muted" style="margin-top:40px">Bookmark this page, it's your private link. · <a class="muted" href="/unsubscribe/${sub.token}">Unsubscribe</a></p>
<script>
document.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',async()=>{
  const url=location.origin+b.dataset.share;
  try{await navigator.clipboard.writeText(url);b.textContent='Link copied';}catch{prompt('Copy this link:',url);}
  setTimeout(()=>b.textContent='Share',2000);
}));
</script>`,
    { token: sub.token, active: "alerts" },
  );
}

const FACET_LABELS: [FacetKey, string][] = [
  ["skillSet", "Skill set"],
  ["roleType", "Role type"],
  ["workLocation", "Work location"],
  ["experience", "Experience"],
  ["degree", "Required degree"],
  ["countries", "Country"],
];

const PREFERRED_ORDER: Partial<Record<FacetKey, string[]>> = {
  experience: [
    "Entry-level",
    "Junior (1–4 years experience)",
    "Mid (5–9 years experience)",
    "Senior (10+ years experience)",
    "Multiple experience levels",
  ],
  degree: ["Undergraduate degree or less", "Master's degree", "Doctoral degree"],
};

/** Every value of a facet in the current data, with counts, plus any value the search already uses. */
function facetOptions(jobs: ApiJob[], key: FacetKey, selected: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const j of jobs) for (const v of facetValues(j, key)) counts.set(v, (counts.get(v) ?? 0) + 1);
  for (const v of selected) if (!counts.has(v)) counts.set(v, 0);
  const order = PREFERRED_ORDER[key];
  return [...counts].sort((a, b) =>
    order ? (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99) : b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

export function searchEditorPage(sub: Subscriber, search: Search | null, jobs: ApiJob[], preset?: Preset): Response {
  const base = `/manage/${sub.token}`;
  const f: Filters = search?.filters ?? preset?.filters ?? EMPTY_FILTERS;
  const name = search?.name ?? preset?.name ?? "";
  const action = `${base}/search/${search ? search.id : "new"}`;
  const groups = FACET_LABELS.map(([key, label]) => {
    const selected = f[key];
    const options = facetOptions(jobs, key, selected)
      .map(
        ([v, n]) =>
          `<label class="chip"><input type="checkbox" name="${key}" value="${esc(v)}"${selected.includes(v) ? " checked" : ""}>${esc(v)}<span class="n">${n}</span></label>`,
      )
      .join("");
    const extra =
      key === "countries"
        ? `<label class="check"><input type="checkbox" name="includeGlobalRemote"${f.includeGlobalRemote ? " checked" : ""}>Include remote jobs open to anyone</label>
<p class="hint">Picking a European country also gets you jobs tagged "Europe".</p>`
        : key === "experience"
          ? `<p class="hint">Heads up: some jobs are tagged "Multiple experience levels" instead of a level, so they won't show up unless you tick that too.
They're mostly general applications and jobs hiring at several levels, usually mid or senior.</p>`
          : "";
    return `<div class="section"><span class="label">${label}</span><div class="chips">${options}</div>${extra}</div>`;
  }).join("");

  const text = (field: keyof Filters, label: string, placeholder: string, hint: string) =>
    `<div class="section"><label class="label" for="${field}">${label}</label><input type="text" id="${field}" name="${field}" value="${esc((f[field] as string[]).join(", "))}" placeholder="${esc(placeholder)}"><p class="hint">${hint}</p></div>`;

  const presets = search
    ? ""
    : `<div class="section"><span class="label">Start from a preset</span><div class="chips">${presetChips(base, preset?.key)}</div></div>`;

  return page(
    search ? `Edit: ${search.name}` : "New search",
    `${backButton(sub.token)}
<h1>${search ? "Edit search" : "New search"}</h1>
<p class="lead">Leave a group blank if you don't care. Tick a few in one group to get any of them.</p>
<form method="post" action="${action}" id="f">
<div class="editor">
<div class="card">
${presets}
<div class="section"><label class="label" for="name">Name</label><input type="text" id="name" name="name" required maxlength="80" value="${esc(name)}" placeholder="e.g. Remote research"></div>
${groups}
${text("keywords", "Keywords", "e.g. interpretability, evals", "Comma-separated. We check the title, summary and description.")}
${text("organizations", "Organizations", "e.g. Anthropic, UK AISI", "Comma-separated. Part of the name is fine.")}
${text("exclude", "Exclude", "e.g. intern, senior", "Skip jobs with these words in the title, org or summary.")}
</div>
<aside class="side">
<div class="card">
<div class="small muted">Matching right now</div>
<div class="count" id="count">–</div>
<div class="small muted" id="recent">&nbsp;</div>
<ul class="sample" id="sample"></ul>
</div>
<button class="btn block" style="height:44px">Save search</button>
<a class="btn ghost block" href="${base}">Cancel</a>
</aside>
</div></form>
<script>
const form=document.getElementById('f');let t;
async function update(){const r=await fetch('/api/count',{method:'POST',body:new FormData(form)});const d=await r.json();
document.getElementById('count').textContent=d.total;
document.getElementById('recent').textContent=d.recent+' new in the last 30 days (~'+Math.round(d.recent/4.3)+' a week)';
document.getElementById('sample').replaceChildren(...d.sample.slice(0,5).map(j=>{const li=document.createElement('li');
const img=document.createElement('img');img.className='logo';img.alt='';if(j.logo)img.src=j.logo;
const div=document.createElement('div');const a=document.createElement('a');a.href=j.url;a.target='_blank';a.rel='noopener';a.textContent=j.name;
const m=document.createElement('span');m.textContent=j.organization+' · '+j.datePublished;div.append(a,m);li.append(img,div);return li;}));}
form.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(update,200);});update();
</script>`,
    { wide: true, token: sub.token, active: "alerts" },
  );
}

export function shortlistPage(sub: Subscriber, entries: ShortlistEntry[]): Response {
  const base = `/manage/${sub.token}`;
  const body = entries.length
    ? `<div class="card list" style="padding:0">${entries
        .map((e) =>
          jobItem(
            e.job,
            e.active ? "" : `<span class="badge">Closed</span>`,
            `<div class="small" style="margin-top:8px;color:var(--faint)"><span style="color:var(--accent)">★</span> Saved ${new Date(e.savedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>`,
            `<form method="post" action="${base}/shortlist/${encodeURIComponent(e.job.id)}/remove"><button class="btn ghost sm">Remove</button></form>`,
          ),
        )
        .join("")}</div>`
    : `<div class="card"><p style="margin:0" class="muted">Nothing saved yet. Hit "Save for later" on any job in your emails and it'll show up here.</p></div>`;
  return page(
    "Shortlist",
    `<h1>Shortlist</h1>
<p class="lead">Jobs you saved from your emails. Closed ones stay here so you don't lose track.</p>
${body}`,
    { token: sub.token, active: "shortlist" },
  );
}

/** Landing page for "Save for later" email links. Saving happens via JS POST so link scanners can't trigger it. */
export function savePage(sub: Subscriber, job: ApiJob): Response {
  const base = `/manage/${sub.token}`;
  const url = `${base}/save/${encodeURIComponent(job.id)}`;
  return page(
    "Save job",
    `<h1><span id="star" style="color:var(--accent)">☆</span> <span id="h">Saving…</span></h1>
<div class="card list" style="padding:0;margin-top:20px">${jobItem(job)}</div>
<div class="row" style="margin-top:16px"><a class="btn" href="${base}/shortlist">Go to shortlist</a><a class="btn ghost" href="${esc(job.url)}" target="_blank" rel="noopener">Open the job</a></div>
<noscript><form method="post" action="${url}" style="margin-top:12px"><button class="btn">Save it</button></form></noscript>
<script>fetch(${JSON.stringify(url)},{method:'POST'}).then(r=>{document.getElementById('h').textContent=r.ok?'Saved to your shortlist':'Couldn\\'t save that, try again?';if(r.ok)document.getElementById('star').textContent='★';});</script>`,
    { token: sub.token, active: "shortlist" },
  );
}

export function sharePage(search: Search, matches: ApiJob[], recent: number, signupAllowed: boolean, code: string, siteKey?: string): Response {
  return page(
    `${search.name}: AI Safety Job Alerts`,
    `<p class="small muted" style="margin:0 0 6px">Someone shared a job search with you</p>
<h1>${esc(search.name)}</h1>
<p class="lead">${esc(describeFilters(search.filters))}</p>
<div class="editor" style="grid-template-columns:minmax(0,1fr) 300px">
<div class="card list" style="padding:0">${
      matches.length
        ? matches.slice(0, 6).map((j) => jobItem(j)).join("")
        : `<div class="job muted">Nothing open right now, but you'll hear about the next one.</div>`
    }</div>
<aside class="side"><div class="card">
<div class="small muted">Open right now</div><div class="count">${matches.length}</div>
<div class="small muted">${recent} new in the last 30 days</div>
</div>
<div class="card">${
      signupAllowed
        ? `<h3>Get these by email</h3>${signupForm(`/s/${esc(code)}`, "Subscribe", siteKey)}<p class="hint">One email a day at most, only when there's something new. You can tweak the filters after.</p>`
        : `<p style="margin:0" class="muted">Sign-ups are closed for now.</p>`
    }</div></aside>
</div>`,
    { wide: true },
  );
}

export function privacyPage(): Response {
  return page(
    "Privacy",
    `<h1>Privacy</h1>
<p class="lead">Short version: we keep your email and your filters so we can send you job alerts, and nothing else. No ads, no tracking, no selling data.</p>
<div class="card stack">
<h3>What we store</h3>
<ul style="margin:0;padding-left:20px">
<li>Your email address, and when you signed up and confirmed it</li>
<li>Your saved searches and the jobs on your shortlist</li>
<li>Which jobs we've already emailed you, so you don't get them twice</li>
</ul>
<h3 style="margin-top:20px">Who handles it</h3>
<ul style="margin:0;padding-left:20px">
<li><strong>Cloudflare</strong> hosts the site and the database (Cloudflare Workers and D1), and keeps short-lived server logs.</li>
<li><strong>Gmail</strong> sends the emails from aisafetyjobs@gmail.com, so copies of sent emails sit in that account's Sent folder.</li>
<li><strong>Cloudflare Turnstile</strong> checks that sign-ups come from people, not bots. It's covered by Cloudflare's <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener">Turnstile Privacy Addendum</a>.</li>
</ul>
<h3 style="margin-top:20px">Getting rid of it</h3>
<p style="margin:0">Unsubscribing (there's a link in every email) deletes your email, searches, shortlist and history right away. Questions? Write to <a href="mailto:aisafetyjobs@gmail.com">aisafetyjobs@gmail.com</a>.</p>
</div>`,
  );
}

export function lostLinkPage(siteKey?: string): Response {
  return page(
    "Get your link",
    `<a class="backbtn" href="/">← Home</a>
<h1>Lost your link?</h1>
<p class="lead">Enter the email you signed up with and we'll send you the link to your alerts.</p>
<div class="card">${signupForm("/link", "Email me my link", siteKey)}</div>`,
  );
}

export function unsubscribePage(token: string, email: string): Response {
  return messagePage(
    "Unsubscribe",
    `<p style="margin:0">Stop emails to <strong>${esc(email)}</strong> and delete your searches?</p>
<form method="post" action="/unsubscribe/${esc(token)}"><button class="btn danger">Yes, unsubscribe</button></form>`,
    { token },
  );
}

export function outboxPage(rows: { id: number; to_email: string; subject: string; created_at: number }[]): Response {
  return page(
    "Outbox (dev)",
    `<h1>Outbox</h1>
<p class="lead">Dry-run emails (MAIL_MODE=outbox), newest first.</p>
<div class="card row" style="justify-content:space-between;margin-bottom:16px">
<form method="post" action="/dev/run"><button class="btn">Run daily job now</button></form>
<form method="post" action="/dev/reset" class="row small muted">Treat jobs from the last
<input type="text" name="days" value="3" style="width:52px;height:32px;text-align:center"> days as new
<button class="btn ghost sm">Reset</button></form>
</div>
${
  rows.length
    ? `<div class="card list">${rows
        .map(
          (r) =>
            `<div class="item"><div style="min-width:0"><a href="/dev/outbox/${r.id}" style="font-weight:600;text-decoration:none">${esc(r.subject)}</a>
<div class="desc">${esc(r.to_email)} · ${new Date(r.created_at).toISOString().replace("T", " ").slice(0, 16)} UTC</div></div>
<a class="small muted" href="/dev/outbox/${r.id}?text=1">Plain text</a></div>`,
        )
        .join("")}</div>`
    : `<div class="card muted">Empty.</div>`
}`,
  );
}
