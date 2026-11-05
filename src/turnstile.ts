// Cloudflare Turnstile (free bot check) for the sign-up forms.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * True if the form's Turnstile token is valid. When no secret is configured the check is skipped,
 * so local dev and the invite-only phase work without a widget.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | null,
  ip: string | null,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetcher(VERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
