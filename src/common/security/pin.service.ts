import { Injectable, BadRequestException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

@Injectable()
export class PinService {
  private readonly saltRounds = 10;
  private readonly pinRegex = /^\d{6}$/;

  /**
   * Validates if a given PIN string is exactly 6 numeric digits.
   * Leading zeroes are valid (e.g., '001827').
   */
  validatePin(pin: string): boolean {
    if (typeof pin !== 'string') {
      return false;
    }
    return this.pinRegex.test(pin);
  }

  /**
   * Generates a cryptographically secure 6-digit numeric PIN.
   * Format: '000000' to '999999'.
   */
  generatePin(): string {
    const randomNum = crypto.randomInt(0, 1000000);
    return randomNum.toString().padStart(6, '0');
  }

  /**
   * Hashes a 6-digit numeric PIN using bcrypt.
   * Throws a BadRequestException if the PIN format is invalid.
   */
  async hashPin(pin: string): Promise<string> {
    if (!this.validatePin(pin)) {
      throw new BadRequestException('PIN must be exactly 6 numeric digits.');
    }
    return bcrypt.hash(pin, this.saltRounds);
  }

  /**
   * Validates if a given PIN string is exactly 4 numeric digits.
   * Leading zeroes are valid (e.g., '0123').
   */
  validate4DigitPin(pin: string): boolean {
    if (typeof pin !== 'string') {
      return false;
    }
    return /^\d{4}$/.test(pin);
  }

  /**
   * Hashes a 4-digit numeric PIN using bcrypt.
   * Throws a BadRequestException if the PIN format is invalid.
   */
  async hash4DigitPin(pin: string): Promise<string> {
    if (!this.validate4DigitPin(pin)) {
      throw new BadRequestException('PIN must be exactly 4 numeric digits.');
    }
    return bcrypt.hash(pin, this.saltRounds);
  }

  /**
   * Generates HMAC-SHA256 lookup hex value for a PIN.
   */
  generatePinLookup(pin: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(pin).digest('hex');
  }

  /**
   * Verifies a 4-digit numeric PIN against a bcrypt hash.
   */
  async verify4DigitPin(pin: string, hash: string): Promise<boolean> {
    if (!this.validate4DigitPin(pin) || !hash) {
      return false;
    }
    return bcrypt.compare(pin, hash);
  }

  /**
   * Verifies a 6-digit numeric PIN against a bcrypt hash.
   * Returns false if the PIN format is invalid or hash comparison fails.
   */
  async verifyPin(pin: string, hash: string): Promise<boolean> {
    if (!this.validatePin(pin) || !hash) {
      return false;
    }
    return bcrypt.compare(pin, hash);
  }
}
