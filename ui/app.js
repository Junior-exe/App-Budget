import { openStore, requestPersistentStorage } from '../data/store.js';
import { buildBackup, serializeBackup, prepareImport, applyImport, backupAgeDays } from '../data/backup.js';
import { demoState } from '../data/demo.js';
import { emptyState } from '../core/types.js';
import { periodKeyOf } from '../core/dates.js';
import { buildDashboard, todayLocal } from './view-model.js';
import { renderDashboard, esc } from './render.js';

const app = document.getElementById('app'), fileInput = document.getElementById('file');
let store, persisted = null, vm = null, monthKey = periodKeyOf(todayLocal());

async function refresh() {
  const state = await store.loadState();
  vm = buildDashboard(state, monthKey);
  const last = await store.lastBackupAt();
  app.innerHTML = renderDashboard(vm, { empty: state.accounts.length === 0, isDemo: !!(await store.getMeta('isDemo')),
    neverBackedUp: last === null, backupAge: backupAgeDays(last, new Date().toISOString()), persisted });
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ask(html, okLabel) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `${html}<form method="dialog"><button value="cancel">${okLabel ? 'Annuler' : 'Fermer'}</button>${okLabel ? `<button class="primary" value="ok">${okLabel}</button>` : ''}</form>`;
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    document.body.append(d); d.showModal();
  });
}

const actions = {
  prev: async () => { monthKey = vm.prevKey; await refresh(); },
  next: async () => { monthKey = vm.nextKey; await refresh(); },
  import: () => fileInput.click(),
  async export() {
    const now = new Date().toISOString();
    download(`budget-sauvegarde-${todayLocal()}.json`, serializeBackup(buildBackup(await store.loadState(), now)));
    await store.markBackupDone(now); await refresh();
  },
  async demo() {
    await store.replaceAll(demoState(todayLocal())); await store.setMeta('isDemo', true);
    persisted = (await requestPersistentStorage()).persisted; await refresh();
  },
  async 'clear-demo'() {
    if (!(await ask('<p>Effacer les données de démonstration ?</p>', 'Effacer'))) return;
    await store.replaceAll(emptyState()); await store.setMeta('isDemo', false); await refresh();
  },
};

app.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) actions[b.dataset.act]?.().catch((err) => alert(err.message)); });

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0]; fileInput.value = ''; if (!file) return;
  const p = prepareImport(await file.text());
  if (!p.ok) return void ask(`<p><strong>Import impossible</strong></p><ul>${p.errors.slice(0, 5).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`, null);
  const s = p.summary;
  const okay = await ask(`<p><strong>Remplacer toutes les données actuelles ?</strong></p><p>Le fichier contient ${s.accounts} compte(s), ${s.transactions} opération(s)${s.firstDate ? ` du ${esc(s.firstDate)} au ${esc(s.lastDate)}` : ''}, ${s.rules} règle(s), ${s.budgets} budget(s), ${s.closures} clôture(s).</p><p class="note">Une sauvegarde de sécurité de vos données actuelles sera téléchargée.</p>`, 'Remplacer');
  if (!okay) return;
  const { safetyBackup } = await applyImport(store, p, { confirmed: true });
  download(`budget-securite-${todayLocal()}.json`, safetyBackup);
  await store.setMeta('isDemo', false); persisted = (await requestPersistentStorage()).persisted; await refresh();
});

try {
  store = await openStore();
  persisted = (await requestPersistentStorage()).persisted;
  await refresh();
  navigator.serviceWorker?.register('./sw.js').catch(() => {});
} catch (err) {
  app.innerHTML = `<section class="card"><h2>Stockage indisponible</h2><p class="note">${esc(err.message)}</p></section>`;
}
