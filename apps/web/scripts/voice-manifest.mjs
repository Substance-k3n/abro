// Writes the voice actions the web app declares to
// apps/api/internal/voice/manifest.json (docs/DECISIONS.md ADR-027). Tezaz
// production sessions only allow published actions, and apps/api publishes
// this file with the production key when it starts, so a new or reworded
// action is live after the next deploy. CI fails when the file is stale:
// run `pnpm --filter @abro/web voice:manifest` after changing an action.
//
// It loads the real action components with stand-ins for the widget and the
// router, renders them once so each useCapability call is seen, and turns
// them into declarations with @tezaz/core -- exactly what the browser sends.

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, '../api/internal/voice/manifest.json');

const stubs = {
  '@tezaz/react': `
    export const captured = [];
    export function useCapability(c) { captured.push(c); }
    export const TezazProvider = ({ children }) => children;
    export const TezazWidget = () => null;
    export const useTezaz = () => ({});`,
  'next/navigation': `
    export const useRouter = () => ({ push() {}, replace() {}, back() {} });
    export const usePathname = () => '/home';
    export const useSearchParams = () => new URLSearchParams();`,
};

const entry = `
  import { createElement } from 'react';
  import { renderToString } from 'react-dom/server';
  import { CapabilityRegistry } from '@tezaz/core';
  import { captured } from '@tezaz/react';
  import { VoiceActions } from '~/components/VoiceAssistant';
  import { FriendActions } from '~/components/voice/FriendActions';
  import { GroupActions } from '~/components/voice/GroupActions';
  import { SearchActions } from '~/components/voice/SearchActions';
  for (const C of [VoiceActions, FriendActions, GroupActions, SearchActions]) {
    renderToString(createElement(C));
  }
  // The same fields, through the same JSON round trip, as useCapability.
  const registry = new CapabilityRegistry();
  for (const { name, description, parameters, confirm, dangerous, scope } of captured) {
    const spec = JSON.parse(JSON.stringify({ name, description, parameters, confirm, dangerous, scope }));
    registry.register({ ...spec, handler: () => null });
  }
  module.exports = registry.declarations();`;

const tmp = mkdtempSync(join(tmpdir(), 'voice-manifest-'));
const bundled = join(tmp, 'actions.cjs');
await build({
  stdin: { contents: entry, resolveDir: web, loader: 'js' },
  bundle: true,
  outfile: bundled,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  logLevel: 'warning',
  plugins: [
    {
      name: 'voice-manifest',
      setup(b) {
        const names = Object.keys(stubs).map((n) => n.replace('/', '\\/'));
        b.onResolve({ filter: new RegExp(`^(${names.join('|')})$`) }, (a) => ({
          path: a.path,
          namespace: 'stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
          contents: stubs[a.path],
          loader: 'js',
        }));
        b.onResolve({ filter: /^~\// }, (a) =>
          b.resolve(`./${a.path.slice(2)}`, { resolveDir: join(web, 'src'), kind: a.kind }),
        );
        // VoiceActions isn't exported from the component file.
        b.onLoad({ filter: /components[\\/]VoiceAssistant\.tsx$/ }, (a) => ({
          contents: `${readFileSync(a.path, 'utf8')}\nexport { VoiceActions };`,
          loader: 'tsx',
        }));
      },
    },
  ],
});

const capabilities = createRequire(import.meta.url)(bundled);
rmSync(tmp, { recursive: true });

const json = JSON.stringify({ capabilities });
writeFileSync(out, await format(json, { parser: 'json' }));
console.log(`voice manifest: ${capabilities.length} actions -> ${out}`);
