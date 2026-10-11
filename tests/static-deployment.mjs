import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { test } from 'node:test';

const output = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', output), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);

for (const path of ['/', '/diagnosis/', '/nested/diagnosis/']) {
  test(`FTP配置先 ${path} 内のJSとCSSを読み込める`, async () => {
    assert.ok(references.some((reference) => reference.endsWith('.js')), 'JS参照が必要');
    assert.ok(references.some((reference) => reference.endsWith('.css')), 'CSS参照が必要');
    const directory = new URL(path, 'https://example.com');
    for (const entry of ['', 'index.html']) {
      for (const reference of references) {
        const resolved = new URL(reference, new URL(entry, directory));
        assert.ok(resolved.href.startsWith(directory.href), `${reference} が配置先 ${path} の外を指している`);
        const file = new URL(resolved.href.slice(directory.href.length), output);
        assert.equal((await stat(file)).isFile(), true, `${file.pathname} が存在しない`);
      }
    }
  });
}
