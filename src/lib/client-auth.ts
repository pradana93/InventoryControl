'use client';

/**
 * Redirects the browser to the login page when an API call returns 401.
 * Used by client components so an expired session sends the user back to
 * login instead of showing a generic "failed to load" error.
 *
 * @returns true if a redirect was triggered (caller should stop handling).
 */
export function redirectToLoginIfUnauthorized(res: Response): boolean {
  if (res.status === 401) {
    const callbackUrl = window.location.pathname + window.location.search;
    window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    return true;
  }
  return false;
}
