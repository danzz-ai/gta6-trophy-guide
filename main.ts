// Leonida Ledger — GTA 6 trophy guide entry (Node 22, standard library only).
//
// The guide itself is plain static files in app/: index.html, style.css, app.js
// and the data files under app/data/. It runs offline in any static server with
// app/ at the root, loads nothing from the network, and keeps the reader's
// checklist in the browser's localStorage.
//
// This program is the hand-in: it copies app/ and screenshots/ from beside
// this file into the output directory and writes dossier.json there, using
// buildDossier from the vendored make.fun library. vendor/makefun-frontend.ts
// must stay byte-identical — the scorer rebuilds the dossier with its own copy
// and compares the two.
//
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Grader run: MAKEFUN_OUTPUT_DIR is unset, so the output goes to /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// Resolve the repository root from this file's location, then the output dir.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fresh output: create it, copy the guide, then the screenshots beside it.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier is what the judge reads: the screenshots, the first load's files
// and bytes, and the source outline. The caps below mirror the scorer's own
// limits (at most 4 screenshots, each at most 256 KiB; app/ at most 993 files
// and 48 MiB), so a dossier that builds here is one the scorer will accept.
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossierText);
