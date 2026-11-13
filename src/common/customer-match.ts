/**
 * Helpers for finding a returning customer by name while the number is being typed.
 *
 * The full number never leaves the server for a suggestion: the app only gets the customer's id and a masked
 * number (first two digits, stars, last three), and sends the id back to pick that customer, so what is shown can
 * never differ from what is saved.
 */

/** "9845012345" -> "98*****345". Anything that is not a 10-digit number gets no mask (and so no suggestion). */
export function maskPhone(phone: string): string | null {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 2)}*****${phone.slice(-3)}` : null;
}

/** Names compare without caring about capital letters or extra spaces. */
export const normalizeName = (name: string): string => name.replace(/\s+/g, ' ').trim();

/** "ravi kumar" -> "Ravi Kumar": the first letter of every word is a capital; other letters are left as typed. */
export function capitalizeName(name: string): string {
  return name.replace(/(^|[\s])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}
