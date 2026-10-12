/**
 * The standard service menu every new branch starts with (name, category, price in ₹).
 * Admins can still change a branch's prices or remove services in Menu pricing.
 */
export interface DefaultMenuItem {
  name: string;
  category: string;
  price: number;
}

export const DEFAULT_MENU: DefaultMenuItem[] = [
  { name: 'Haircut + Hair Wash & Style', category: 'Hair', price: 150 },
  { name: 'Hair Colour', category: 'Hair', price: 300 },
  { name: 'Beard Trim & Shape', category: 'Beard', price: 100 },
  { name: 'Beard Spa', category: 'Beard', price: 300 },
  { name: 'Beard Colour', category: 'Beard', price: 250 },
  { name: 'Clean-up', category: 'Skin', price: 400 },
  { name: 'De-Tan Treatment', category: 'Skin', price: 400 },
  { name: 'Brightening Facial', category: 'Skin', price: 1200 },
  { name: 'Acne Control Facial', category: 'Skin', price: 1200 },
  { name: 'Gold Facial', category: 'Skin', price: 1700 },
  { name: 'Hydra Facial', category: 'Skin', price: 3000 },
  { name: 'Hair Spa', category: 'Hair', price: 600 },
  { name: 'Head Massage', category: 'Hair', price: 200 },
  { name: 'Straightening', category: 'Hair', price: 2499 },
  { name: 'Smoothing', category: 'Hair', price: 2499 },
  { name: 'Perming', category: 'Hair', price: 3999 },
  {
    name: 'The Basic (Haircut + Hair Wash & Style + Beard Trim + Head Massage)',
    category: 'Combo',
    price: 349,
  },
  {
    name: 'The Essential (Haircut + Hair Wash & Style + Beard Trim + Deep Clean Facial / De-Tan Treatment)',
    category: 'Combo',
    price: 549,
  },
  {
    name: 'The Classic (Haircut + Hair Wash & Style + Beard Trim + De-Tan Treatment / Clean-up + Hair Scalp Renewal)',
    category: 'Combo',
    price: 999,
  },
  {
    name: 'The Treatment (Haircut + Hair Wash & Style + Beard Trim + Hair Scalp Renewal + HydraFacial)',
    category: 'Combo',
    price: 3499,
  },
];
