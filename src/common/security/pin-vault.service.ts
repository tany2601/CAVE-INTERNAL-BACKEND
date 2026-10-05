import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';

/**
 * Reversible PIN storage. Login still verifies against the bcrypt hash; this encrypted copy
 * (AES-256-GCM) exists only so an admin can see the current PIN in Settings.
 * The key comes from PIN_VAULT_KEY, falling back to the JWT secret.
 */
@Injectable()
export class PinVaultService {
  constructor(private readonly configService: ConfigService) {}

  private key(): Buffer {
    const secret =
      this.configService.get<string>('PIN_VAULT_KEY') ||
      this.configService.get<string>('JWT_SECRET') ||
      this.configService.get<string>('SUPABASE_SECRET_KEY') ||
      '';
    return crypto.createHash('sha256').update(`cave-pin-vault:${secret}`).digest();
  }

  encrypt(pin: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
  }

  /** Returns null when there is no stored copy or it can't be decrypted (e.g. key rotated). */
  decrypt(blob: string | null | undefined): string | null {
    if (!blob) return null;
    try {
      const [iv, tag, data] = blob.split('.').map((p) => Buffer.from(p, 'base64url'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
