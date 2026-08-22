/**
 * FINAL SCORE = TOTAL PLAYER POINTS + BUDGET BONUS
 * BUDGET BONUS = REMAINING BUDGET (lakh) / 10
 */
function computeScore(totalPlayerPoints, remainingBudgetLakh) {
  const budgetBonus = remainingBudgetLakh / 10;
  const finalScore = totalPlayerPoints + budgetBonus;
  return { budgetBonus, finalScore };
}

/**
 * Determine winner between two participant result objects:
 * { userId, playerPoints, remainingBudgetLakh, finalScore }
 * Tiebreak: 1) higher finalScore  2) higher playerPoints  3) higher remainingBudgetLakh  4) DRAW
 */
function decideWinner(a, b) {
  if (a.finalScore !== b.finalScore) return a.finalScore > b.finalScore ? a.userId : b.userId;
  if (a.playerPoints !== b.playerPoints) return a.playerPoints > b.playerPoints ? a.userId : b.userId;
  if (a.remainingBudgetLakh !== b.remainingBudgetLakh) {
    return a.remainingBudgetLakh > b.remainingBudgetLakh ? a.userId : b.userId;
  }
  return null; // DRAW
}

module.exports = { computeScore, decideWinner };
