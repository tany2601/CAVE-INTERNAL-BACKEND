import { describe, it, expect } from 'vitest';
import { PinVaultService } from './pin-vault.service.js';

const vault = (secret: string) =>
  new PinVaultService({ get: (k: string) => (k === 'JWT_SECRET' ? secret : undefined) } as any);

describe('PinVaultService', () => {
  it('round-trips a PIN and never stores it in the clear', () => {
    const v = vault('s1');
    const blob = v.encrypt('202600');
    expect(blob).not.toContain('202600');
    expect(v.decrypt(blob)).toBe('202600');
  });

  it('uses a fresh IV each time', () => {
    const v = vault('s1');
    expect(v.encrypt('1234')).not.toBe(v.encrypt('1234'));
  });

  it('returns null for missing, tampered or foreign-key blobs', () => {
    const blob = vault('s1').encrypt('1234');
    expect(vault('s1').decrypt(null)).toBeNull();
    expect(vault('s1').decrypt('garbage')).toBeNull();
    expect(vault('other').decrypt(blob)).toBeNull();
    expect(vault('s1').decrypt(blob.slice(0, -2) + 'AA')).toBeNull();
  });
});
