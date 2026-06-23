import Decimal from 'decimal.js';

export interface TaxBreakdown {
  salePriceWithTax: Decimal;
  priceWithoutTax: Decimal;
  taxAmount: Decimal;
  taxRate: Decimal;
}

// Section 3.14: price entered is always the final consumer price (IVA included).
// System back-calculates the breakdown.
export function calculateTaxBreakdown(
  priceWithTax: Decimal,
  taxRate: Decimal = new Decimal('0.16'),
): TaxBreakdown {
  const priceWithoutTax = priceWithTax.div(taxRate.plus(1)).toDecimalPlaces(6);
  const taxAmount = priceWithTax.minus(priceWithoutTax).toDecimalPlaces(6);

  return {
    salePriceWithTax: priceWithTax,
    priceWithoutTax,
    taxAmount,
    taxRate,
  };
}

export function calculateMarginPercent(
  salePriceWithTax: Decimal,
  recipeCost: Decimal,
  taxRate: Decimal = new Decimal('0.16'),
): Decimal {
  // Margin is calculated against price WITHOUT tax (IVA is not revenue)
  const priceWithoutTax = salePriceWithTax.div(taxRate.plus(1));
  if (priceWithoutTax.isZero()) return new Decimal(0);
  return priceWithoutTax
    .minus(recipeCost)
    .div(priceWithoutTax)
    .times(100)
    .toDecimalPlaces(2);
}
