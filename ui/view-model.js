// Transforme les résultats du core en données d'affichage. Aucune formule ici : uniquement des lectures.
import { computeBalances } from '../core/balances.js';
import { computeMonth, suggestExtraSavings } from '../core/month.js';
import { addMonths } from '../core/dates.js';

const pad = (n) => String(n).padStart(2, '0');
export const todayLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function monthLabel(key) {
  const s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  return s[0].toUpperCase() + s.slice(1);
}

export function buildDashboard(state, monthKey) {
  const m = computeMonth(state, monthKey);
  const bal = computeBalances(state.accounts, state.transactions);
  const sug = suggestExtraSavings(state, monthKey);
  const closure = state.closures.find((c) => c.monthKey === monthKey) ?? null;
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  return {
    monthKey, label: monthLabel(monthKey), prevKey: addMonths(monthKey, -1), nextKey: addMonths(monthKey, 1), closed: m.closed,
    accounts: state.accounts.filter((a) => a.active).sort((a, b) => a.order - b.order)
      .map((a) => ({ id: a.id, name: a.name, isSavings: a.isSavings, balanceCents: bal.byAccount[a.id] })),
    totalCents: bal.totalCents,
    position: { ...m.free.position, plannedIncomeCents: m.income.plannedRemainingCents },
    month: { receivedCents: m.income.receivedCents, plannedIncomeCents: m.income.plannedRemainingCents,
      fixedCents: m.fixed.totalCents, budgetsSpentCents: sum(m.budgets.lines.map((l) => l.spentCents)),
      budgetsReservedCents: m.budgets.reservedCents, overrunCents: m.budgets.overrunCents, freeSpentCents: m.freeSpentCents },
    savings: { plannedCents: m.savings.plannedCents, netTransferredCents: m.savings.netTransferredCents,
      withdrawnCents: m.savings.withdrawnCents, extraConfirmed: closure !== null,
      extraCents: closure ? closure.extraSavingsCents : sug.fromFreeCents, unspentBudgetsCents: sug.fromUnspentBudgetsCents },
    toCommit: m.toCommit,
  };
}
