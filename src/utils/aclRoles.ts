/**
 * ACL roles, as MeshCore firmware ClientACL.h: the role is the low two bits of
 * the permissions byte. The upper bits are kept when a role changes.
 */
export const ACL_ROLE_MASK = 0x03;
// Admin is the role with both bits set, so it equals the mask. They are
// different things: one is a value, the other selects the role bits.
export const ACL_ROLE_ADMIN = 0x03;

/** Roles an entry can be given. Guest (0) removes an entry, so it is not offered. */
export const ACL_ASSIGNABLE_ROLES: { value: number; label: string }[] = [
  { value: ACL_ROLE_ADMIN, label: 'Admin' },
  { value: 2, label: 'Read-write' },
  { value: 1, label: 'Read-only' },
];

/** Labels for the role names the backend reports (`acl_role_name`). */
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  read_write: 'Read-write',
  read_only: 'Read-only',
  guest: 'Guest',
};

export function aclRoleLabel(name: string | undefined): string {
  return (name && ROLE_LABELS[name]) || name || 'Unknown';
}

export function aclRoleBadgeClass(name: string | undefined): string {
  if (name === 'admin') return 'pill-green';
  if (name === 'read_write') return 'pill-cyan';
  return 'pill-neutral';
}

/** The permissions byte with its role replaced and its upper bits kept. */
export function withAclRole(permissionsValue: number | undefined, role: number): number {
  return ((permissionsValue ?? 0) & ~ACL_ROLE_MASK & 0xff) | (role & ACL_ROLE_MASK);
}

/**
 * A full public key from pasted text: 64 hex characters, ignoring spaces,
 * colons and a 0x prefix. Returns null when it is not one.
 */
export function normalizePublicKey(text: string): string | null {
  const hex = text.trim().replace(/^0x/i, '').replace(/[\s:]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}
