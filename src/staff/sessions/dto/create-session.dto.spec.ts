import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSessionDto } from './create-session.dto.js';

const errorsFor = async (body: object) =>
  (await validate(plainToInstance(CreateSessionDto, body))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('CreateSessionDto', () => {
  it('needs a real name of at least 3 characters (after trimming)', async () => {
    expect(await errorsFor({ customerName: 'Al' })).toContain('Please enter your real name.');
    expect(await errorsFor({ customerName: '  Al  ' })).toContain('Please enter your real name.');
    expect(await errorsFor({ customerName: 'Ali' })).toEqual([]);
  });

  it('rejects digits and symbols in the name', async () => {
    expect(await errorsFor({ customerName: 'Ali123' })).not.toEqual([]);
    expect(await errorsFor({ customerName: 'Ali!' })).not.toEqual([]);
    expect(await errorsFor({ customerName: "Mary-Ann O'Neil Jr." })).toEqual([]);
    expect(await errorsFor({ customerName: 'அருண்' })).toEqual([]);
  });

  it('accepts only Indian mobile numbers', async () => {
    expect(await errorsFor({ customerName: 'Ali', customerMobile: '+919876543210' })).toEqual([]);
    expect(await errorsFor({ customerName: 'Ali', customerMobile: '5123456789' })).not.toEqual([]);
    expect(await errorsFor({ customerName: 'Ali', customerMobile: '98765' })).not.toEqual([]);
  });

  it('validates the optional list of picked services', async () => {
    expect(await errorsFor({ customerName: 'Ali', serviceIds: ['nope'] })).not.toEqual([]);
    const id = '11111111-1111-4111-8111-111111111111';
    expect(await errorsFor({ customerName: 'Ali', serviceIds: [id, id] })).not.toEqual([]);
    expect(await errorsFor({ customerName: 'Ali', serviceIds: [id] })).toEqual([]);
  });
});
