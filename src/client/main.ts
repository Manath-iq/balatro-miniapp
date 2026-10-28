// Entry: routes ?sandbox=<name> to src/client/<name>/sandbox.ts (dev demo scenes), otherwise the default screen.
import './base.css';

type SandboxModule = { run(root: HTMLElement): void | Promise<void> };
const sandboxes = import.meta.glob<SandboxModule>('./*/sandbox.ts');

const root = document.getElementById('app')!;
const name = new URLSearchParams(location.search).get('sandbox');
const load = name ? sandboxes[`./${name}/sandbox.ts`] : undefined;

if (load) {
  void load().then((m) => m.run(root));
} else {
  void import('./diag');
}
