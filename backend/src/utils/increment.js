/**
 * Bid increment rules, expressed purely in integer lakh.
 * < 1 Cr (100 lakh):        +5 lakh
 * 1 Cr to <2 Cr:             +10 lakh
 * 2 Cr to <5 Cr:             +25 lakh
 * 5 Cr to <10 Cr:            +50 lakh
 * >= 10 Cr:                  +100 lakh (1 Cr)
 */
function incrementFor(currentBidLakh) {
  const v = currentBidLakh;
  if (v < 100) return 5;
  if (v < 200) return 10;
  if (v < 500) return 25;
  if (v < 1000) return 50;
  return 100;
}

function nextValidBid(currentBidLakh) {
  return currentBidLakh + incrementFor(currentBidLakh);
}

module.exports = { incrementFor, nextValidBid };
