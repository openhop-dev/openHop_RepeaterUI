export function getCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const key = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(key)) {
      try {
        return decodeURIComponent(cookie.substring(key.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}
