/** A tiny helper so spoken answers don't sound canned: pick one of several ways to say the same thing. */
export type Rng = () => number;

export const pick = <T,>(rng: Rng, options: readonly T[]): T => options[Math.min(options.length - 1, Math.floor(rng() * options.length))];

/** "Rahul"/"Priyesh" style names are the app's job; the backend only needs warm, varied wording. */
export const OPENERS = {
  good: ['Good news!', 'Ooh, this one’s nice.', 'The cash register is humming.', 'Alright, happy numbers.', 'Now this is what I like to see.'],
  warn: ['Okay, small heads up.', 'Not to spoil your day, but…', 'Right, one thing to keep an eye on.', 'So, a little something to look at.'],
  info: ['Here you go.', 'Fresh off the press.', 'Alright, here’s the picture.', 'Sure thing.'],
} as const;
