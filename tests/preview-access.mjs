// Keep deployment protection credentials on the exact Preview origin only.
export function previewAccess(base, secret = '') {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Preview requires an HTTPS URL without embedded credentials');
  }
  if (url.searchParams.has('_vercel_share') || url.searchParams.has('x-vercel-protection-bypass')) {
    throw new Error('Use a query-free Preview URL and VERCEL_AUTOMATION_BYPASS_SECRET; share links are not supported by this gate');
  }
  const bypass = String(secret).trim();
  return {
    origin: url.origin,
    headersFor(target, original = {}) {
      const headers = Object.fromEntries(Object.entries(original).filter(([key]) =>
        !['x-vercel-protection-bypass', 'x-vercel-set-bypass-cookie'].includes(key.toLowerCase())));
      if (bypass && new URL(target).origin === url.origin) headers['x-vercel-protection-bypass'] = bypass;
      return headers;
    }
  };
}

export async function routePreviewRequest(route, access) {
  const request = route.request();
  const headers = access.headersFor(request.url(), request.headers());
  if (new URL(request.url()).origin !== access.origin) return route.continue({ headers });
  // Playwright header overrides can survive redirects. Fetch only this hop;
  // fulfill lets the browser make the next request without carrying the secret.
  // https://playwright.dev/docs/api/class-route#route-fetch-option-max-redirects
  const response = await route.fetch({ headers, maxRedirects:0 });
  return route.fulfill({ response });
}
