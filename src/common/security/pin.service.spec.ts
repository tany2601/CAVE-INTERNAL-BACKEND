import { describe, it, expect, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PinService } from './pin.service.js';

describe('PinService', () => {
  let service: PinService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PinService],
    }).compile();

    service = module.get<PinService>(PinService);
  });

  describe('validatePin', () => {
    it('should validate a valid 6-digit PIN', () => {
      expect(service.validatePin('482613')).toBe(true);
    });

    it('should validate a valid PIN with leading zero', () => {
      expect(service.validatePin('001827')).toBe(true);
    });

    it('should reject an invalid 4-digit PIN', () => {
      expect(service.validatePin('1234')).toBe(false);
    });

    it('should reject an invalid 5-digit PIN', () => {
      expect(service.validatePin('12345')).toBe(false);
    });

    it('should reject an invalid 7-digit PIN', () => {
      expect(service.validatePin('1234567')).toBe(false);
    });

    it('should reject letters', () => {
      expect(service.validatePin('12AB34')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(service.validatePin('12@456')).toBe(false);
    });

    it('should reject an empty PIN', () => {
      expect(service.validatePin('')).toBe(false);
    });
  });

  describe('generatePin', () => {
    it('should always generate a PIN with exactly 6 digits', () => {
      for (let i = 0; i < 50; i++) {
        const pin = service.generatePin();
        expect(service.validatePin(pin)).toBe(true);
        expect(pin.length).toBe(6);
      }
    });
  });

  describe('hashPin & verifyPin', () => {
    it('should produce a hash different from the plaintext PIN', async () => {
      const pin = '482613';
      const hash = await service.hashPin(pin);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(pin);
    });

    it('should verify a correct PIN against its hash', async () => {
      const pin = '482613';
      const hash = await service.hashPin(pin);
      const isMatch = await service.verifyPin(pin, hash);
      expect(isMatch).toBe(true);
    });

    it('should not verify an incorrect PIN against a hash', async () => {
      const pin = '482613';
      const incorrectPin = '739214';
      const hash = await service.hashPin(pin);
      const isMatch = await service.verifyPin(incorrectPin, hash);
      expect(isMatch).toBe(false);
    });

    it('should throw BadRequestException when trying to hash an invalid PIN', async () => {
      await expect(service.hashPin('1234')).rejects.toThrow(BadRequestException);
    });
  });

  describe('4-digit PIN methods & generatePinLookup', () => {
    it('should validate valid 4-digit PINs', () => {
      expect(service.validate4DigitPin('1234')).toBe(true);
      expect(service.validate4DigitPin('0123')).toBe(true);
      expect(service.validate4DigitPin('12345')).toBe(false);
      expect(service.validate4DigitPin('123')).toBe(false);
    });

    it('should hash and verify 4-digit PINs', async () => {
      const pin = '2345';
      const hash = await service.hash4DigitPin(pin);
      expect(hash).not.toBe(pin);
      expect(await service.verify4DigitPin(pin, hash)).toBe(true);
      expect(await service.verify4DigitPin('9999', hash)).toBe(false);
    });

    it('should throw BadRequestException on invalid 4-digit PIN hash', async () => {
      await expect(service.hash4DigitPin('12345')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should generate consistent HMAC-SHA256 lookup string', () => {
      const pin = '1234';
      const secret = 'test-secret';
      const lookup1 = service.generatePinLookup(pin, secret);
      const lookup2 = service.generatePinLookup(pin, secret);
      expect(lookup1).toBe(lookup2);
      expect(lookup1).toHaveLength(64);
    });
  });
});
