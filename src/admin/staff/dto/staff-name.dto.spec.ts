import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStaffDto } from './update-staff.dto.js';

const nameErrors = async (name: string) =>
  (await validate(plainToInstance(UpdateStaffDto, { name }))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('staff name validation', () => {
  it('allows letters, spaces and . \' -', async () => {
    expect(await nameErrors('Rahul Sharma')).toEqual([]);
    expect(await nameErrors("D'Souza-Rao Jr.")).toEqual([]);
  });

  it('rejects names with digits or symbols', async () => {
    expect(await nameErrors('Rahul2')).not.toEqual([]);
    expect(await nameErrors('Rahul@home')).not.toEqual([]);
    expect(await nameErrors('7 Stylist')).not.toEqual([]);
  });
});
