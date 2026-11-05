# AI Safety Job Alerts

Daily email digests of new openings from [AISafety.com/jobs](https://aisafety.com/jobs), filtered per saved search.
Runs on Cloudflare Workers + D1. Job data: AISafety.com Data API (`/api/v1/jobs`, CC-BY-4.0).

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # DEV=true enables /dev/* routes and open sign-up
npm run db:migrate               # create the local D1 database
npm run dev                      # http://localhost:8787
npm test
```

- Sign up at `/`. In dev mode the confirmation link is shown directly; all emails go to the
  **outbox** (`/dev/outbox`) instead of being sent (`MAIL_MODE=outbox`).
- `/dev/outbox` also has buttons to run the daily job now and to mark recent jobs as unseen, so the
  next run treats them as new. `npm run run-daily` triggers the real cron handler.
- The first sync marks every existing job as seen (`seeded`), so nobody gets the backlog.

## Pages

- `/manage/<token>`: your searches (edit, share, delete) and email preview. `?preset=` on
  `/search/new` pre-fills a starter search (see `src/presets.ts`).
- `/manage/<token>/shortlist`: jobs saved via "Save for later" in emails. The email link opens
  `/manage/<token>/save/<jobId>`, which saves with a JS POST so link scanners can't trigger it.
- `/s/<share_code>`: public page for a shared search, with a sign-up form that copies the search
  into the new subscriber's account once they confirm.

## How the daily run works (09:00 UTC)

1. Fetch all jobs from the API and upsert them; ids not seen before are "new".
2. For each confirmed subscriber: new jobs first seen after they confirmed, not yet sent to them,
   from the last 3 days (so a failed send is retried next day).
3. Match against their searches (OR within a filter group, AND across groups), one email each,
   skipped when nothing matches. Sent jobs are recorded in `sent`.

## Deploying (Cloudflare free plan)

```sh
npx wrangler login
npx wrangler d1 create aisafety-job-alerts        # put the printed database_id in wrangler.jsonc
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy                                # prints the workers.dev URL
```

Then in `wrangler.jsonc` set `BASE_URL` to that URL, `MAIL_MODE` to `"gmail"`, `GMAIL_USER`, and
`ALLOWED_EMAILS` (who may sign up while `SIGNUP_OPEN` is `"false"`), add the secrets, and deploy again:

```sh
npx wrangler secret put GMAIL_APP_PASSWORD
npx wrangler secret put ADMIN_KEY                  # any long random string, e.g. `openssl rand -hex 24`
npx wrangler deploy
```

Test: sign up on the site, confirm from the real email, add a search, then "Preview email → Email it
to me". Trigger the daily run without waiting for 09:00 UTC:

```sh
curl -X POST -H "Authorization: Bearer $ADMIN_KEY" https://<your-worker>.workers.dev/admin/run
npx wrangler tail                                  # live logs, incl. the 09:00 UTC cron run
```

The first visit seeds the job list without emailing anyone, so real digests start with the next new
postings. `/dev/*` routes are off in production (`DEV` is only set in `.dev.vars`).

## Not done yet

- Nothing outstanding; sign-ups are open (`SIGNUP_OPEN=true`) with Turnstile on all sign-up forms.
