export const ML_ACCOUNT_OPTIONS = [
  { sellerId: '532562281', label: 'ML1 · Budamix' },
  { sellerId: '3642409154', label: 'ML2 · Kanoa' },
  { sellerId: '2237203375', label: 'ML3 · SPBROGLIO' },
];

export function mlAccountLabel(sellerId?: string | null) {
  return ML_ACCOUNT_OPTIONS.find((account) => account.sellerId === sellerId)?.label
    ?? (sellerId ? `Conta ML · ${sellerId}` : 'Conta ML não identificada');
}
