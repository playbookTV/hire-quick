/** Check local links in the maintained Markdown guides; no network or database access. */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'documentation/README.md',
  ...readdirSync(resolve(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `docs/${name}`),
];

function withoutFences(markdown) {
  let fence = null;
  return markdown.split('\n').map((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  });
}

const anchorCache = new Map();
function anchors(path) {
  if (anchorCache.has(path)) return anchorCache.get(path);
  const result = new Set();
  const counts = new Map();
  for (const line of withoutFences(readFileSync(path, 'utf8'))) {
    for (const match of line.matchAll(/\bid=["']([^"']+)["']/g)) result.add(match[1]);
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+\s*)?$/);
    if (!heading) continue;
    const slug = heading[1]
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    result.add(count ? `${slug}-${count}` : slug);
  }
  anchorCache.set(path, result);
  return result;
}

const errors = [];
let checked = 0;
for (const file of files) {
  const source = resolve(root, file);
  const lines = withoutFences(readFileSync(source, 'utf8'));
  for (const [index, line] of lines.entries()) {
    // Maintained docs use inline links. Historical specs are checked as targets only.
    for (const match of line.matchAll(/!?\[[^\]\n]+\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1].replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) continue;
      checked += 1;
      const [rawPath, fragment] = href.split('#');
      try {
        const target = rawPath ? resolve(dirname(source), decodeURIComponent(rawPath)) : source;
        if (!existsSync(target)) {
          errors.push(`${file}:${index + 1}: missing target ${href}`);
        } else if (
          fragment &&
          statSync(target).isFile() &&
          extname(target) === '.md' &&
          !anchors(target).has(decodeURIComponent(fragment))
        ) {
          errors.push(
            `${file}:${index + 1}: missing heading #${fragment} in ${relative(root, target)}`,
          );
        }
      } catch (error) {
        errors.push(`${file}:${index + 1}: invalid link ${href}: ${error.message}`);
      }
    }
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Checked ${checked} local links in ${files.length} maintained documents.\n`);
}
