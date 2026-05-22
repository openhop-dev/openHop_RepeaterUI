/**
 * Authentication utilities for managing JWT tokens and client IDs
 */

const TOKEN_KEY = 'pymc_jwt_token';
const CLIENT_ID_KEY = 'pymc_client_id';

/**
 * Generate or retrieve persistent client ID
 */
export function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);

  if (!clientId) {
    // Generate new client ID: timestamp + random hex
    clientId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }

  return clientId;
}

/**
 * Get stored JWT token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store JWT token
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Clear JWT token
 */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated (has valid token)
 * Note: This only checks if token exists, not if it's expired
 */
export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export interface JWTPayload {
  sub: string;
  exp: number;
  iat: number;
  client_id: string;
}

/**
 * Parse JWT payload without verification (client-side only check)
 */
export function parseJWT(token: string): JWTPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired (client-side check only)
 */
export function isTokenExpired(): boolean {
  const token = getToken();
  if (!token) return true;

  const payload = parseJWT(token);
  if (!payload || !payload.exp) return true;

  // Check if expired (with 30 second buffer)
  return Date.now() >= payload.exp * 1000 - 30000;
}

/**
 * Check if token should be refreshed (when less than 5 minutes remaining)
 */
export function shouldRefreshToken(): boolean {
  const token = getToken();
  if (!token) return false;

  const payload = parseJWT(token);
  if (!payload || !payload.exp) return false;

  // Refresh if less than 5 minutes remaining (300 seconds)
  const timeUntilExpiry = payload.exp * 1000 - Date.now();
  return timeUntilExpiry > 0 && timeUntilExpiry < 300000;
}

/**
 * Get time until token expiry in milliseconds
 */
export function getTimeUntilExpiry(): number {
  const token = getToken();
  if (!token) return 0;

  const payload = parseJWT(token);
  if (!payload || !payload.exp) return 0;

  return Math.max(0, payload.exp * 1000 - Date.now());
}

/**
 * Get username from JWT token
 */
export function getUsername(): string | null {
  const token = getToken();
  if (!token) return null;

  const payload = parseJWT(token);
  if (!payload || !payload.sub) return null;

  return payload.sub;
}
