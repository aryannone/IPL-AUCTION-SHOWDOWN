// All money is represented internally as an INTEGER number of lakh.
// Never use floating point for money. ₹1 Cr = 100 lakh. Starting budget = 1000 lakh.

const STARTING_BUDGET_LAKH = 1000;

function lakhToCrDisplay(lakh) {
  const n = Number(lakh) || 0;
  const cr = n / 100;
  // Trim trailing zeros but keep up to 2 decimals
  return `₹${cr.toFixed(2).replace(/\.00$/, '')} Cr`;
}

function isValidLakhInt(v) {
  return Number.isInteger(v) && v >= 0;
}

module.exports = { STARTING_BUDGET_LAKH, lakhToCrDisplay, isValidLakhInt };
