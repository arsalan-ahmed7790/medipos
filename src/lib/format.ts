// Currency / number formatting helpers.

export const fmtMoney = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoneyWithSymbol = (n: number, symbol = "₹"): string =>
  `${symbol}${fmtMoney(n)}`;
