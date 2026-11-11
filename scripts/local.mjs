// Lance l'application en mode production sur ce poste (pages compilées une fois : navigation instantanée).
//   npm run local            → compile puis démarre sur http://localhost:3000
//   npm run local -- --no-build   → redémarre sans recompiler (si rien n'a changé dans le code)
// Le build va dans .next-prod : il ne se mélange jamais avec `npm run dev` (dossier .next).
import { spawnSync } from 'node:child_process';

const env = { ...process.env, NEXT_DIST_DIR: '.next-prod' };
const run = (args) => {
  const r = spawnSync('npx', ['next', ...args], { stdio: 'inherit', env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!process.argv.includes('--no-build')) {
  console.log('\n▶ Compilation de l’application (1 à 2 minutes)…\n');
  run(['build']);
}
console.log('\n▶ Application prête : http://localhost:3000\n');
run(['start', '-p', process.env.PORT ?? '3000']);
