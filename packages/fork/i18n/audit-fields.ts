import fs from 'node:fs';
import path from 'node:path';
import { resolveModulePath } from './ast-utils';
import { auditFields, exportedFields, type FieldFinding } from './field-audit';

const root = path.resolve(import.meta.dir, '../../..');
const dictionary = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, 'locales/zh-CN.json'), 'utf8')
);
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const scopes = args.filter((arg) => arg !== '--strict');
const files = new Set<string>();
const collect = (target: string) => {
  const absolute = path.resolve(target);
  if (fs.statSync(absolute).isDirectory()) {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      collect(path.join(absolute, entry.name));
    }
  } else if (
    /\.tsx?$/.test(absolute) &&
    !/\.(?:test|spec|d)\.tsx?$/.test(absolute)
  )
    files.add(absolute);
};
for (const scope of scopes.length ? scopes : [path.join(root, 'apps/web/src')])
  collect(scope);
const exports = new Map<string, ReturnType<typeof exportedFields>>();
const webDir = path.join(root, 'apps/web');
const aliases: Record<string, string[]> = JSON.parse(
  fs.readFileSync(path.join(webDir, 'tsconfig.json'), 'utf8')
).compilerOptions.paths;
const resolveModule = (from: string, module: string) => {
  for (const key of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    const wildcard = key.endsWith('*');
    const prefix = wildcard ? key.slice(0, -1) : key;
    if (wildcard ? !module.startsWith(prefix) : module !== key) continue;
    for (const target of aliases[key]) {
      const candidate = path.resolve(
        webDir,
        target.replace('*', module.slice(prefix.length))
      );
      if (
        candidate.includes('node_modules') ||
        candidate.includes('packages/fork/i18n')
      )
        continue;
      const resolved = resolveModulePath(
        `./${path.basename(candidate)}`,
        path.join(path.dirname(candidate), '__i18n__.ts'),
        path.join(webDir, 'src')
      );
      if (resolved && /\.tsx?$/.test(resolved)) return resolved;
    }
  }
  return resolveModulePath(module, from, path.join(webDir, 'src'));
};
const resolveImport = (from: string, module: string, name: string) => {
  const file = resolveModule(from, module);
  if (!file) return;
  if (!exports.has(file))
    exports.set(file, exportedFields(fs.readFileSync(file, 'utf8'), file));
  return exports.get(file)?.get(name);
};
const findings: FieldFinding[] = [];
const errors: { file: string; message: string }[] = [];
for (const file of files) {
  try {
    findings.push(
      ...auditFields(
        fs.readFileSync(file, 'utf8'),
        file,
        dictionary,
        resolveImport
      )
    );
  } catch (error) {
    errors.push({ file, message: String(error) });
  }
}
const unique = [
  ...new Map(
    findings.map((item) => [
      `${item.file}:${item.line}:${item.text}:${item.kind}`,
      item,
    ])
  ).values(),
];
console.log(
  JSON.stringify({ files: files.size, findings: unique, errors }, null, 2)
);
if (errors.length || (strict && unique.length)) process.exitCode = 1;
