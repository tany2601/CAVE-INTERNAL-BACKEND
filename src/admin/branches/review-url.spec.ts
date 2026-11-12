import { describe, it, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBranchDto } from './dto/update-branch.dto.js';

const errorsFor = async (reviewUrl: unknown) =>
  (await validate(plainToInstance(UpdateBranchDto, { reviewUrl }))).flatMap((e) => Object.values(e.constraints ?? {}));

describe('a branch review link', () => {
  it('accepts Google review links in the forms Google gives out', async () => {
    for (const url of [
      'https://g.page/r/CkarkalaEAI/review',
      'https://search.google.com/local/writereview?placeid=ChIJabc123',
      'https://www.google.com/maps/place/CAVE+Karkala',
      'https://maps.app.goo.gl/AbCdEf123',
      'https://g.co/kgs/abc123',
      'https://tinyurl.com/tfj26pfz', // a short link to the Google review page
    ]) {
      expect(await errorsFor(url), url).toEqual([]);
    }
  });

  it('can be cleared, and refuses anything that is not a Google https link', async () => {
    expect(await errorsFor(null)).toEqual([]);
    expect(await errorsFor(undefined)).toEqual([]);
    for (const url of ['http://g.page/r/abc/review', 'https://evil.example.com/g.page/r/abc', 'https://tinyurl.com.evil.com/x', 'https://google.evil.com/x', 'javascript:alert(1)', 'g.page/r/abc', 'https://g.page.evil.com/r/x']) {
      expect((await errorsFor(url)).length, url).toBeGreaterThan(0);
    }
  });
});
