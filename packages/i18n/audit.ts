import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default || traverseModule;

const webSrcDir = path.resolve(__dirname, '../../apps/web/src');
const zhDictPath = path.resolve(__dirname, './locales/zh-CN.json');
const diffDir = path.resolve(__dirname, './diff');

import {
  getObjectPropertyName,
  getContextKey,
  isIgnoredPath,
  isUiFallbackStringLiteral,
  parseSimpleTemplateLiteral,
  shouldTranslateText as shouldAuditText,
  TRANSLATABLE_ATTRIBUTES,
  TRANSLATABLE_OBJECT_KEYS,
} from './ast-utils';

function getAllFiles(dir: string, ext: RegExp, list: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.vite') {
        getAllFiles(full, ext, list);
      }
    } else if (
      ext.test(file) &&
      !file.endsWith('.d.ts') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.test.tsx')
    ) {
      list.push(full);
    }
  }
  return list;
}

async function audit() {
  const arg = process.argv[2];
  let files: string[] = [];
  let targetDir = webSrcDir;

  if (arg) {
    const resolved = path.resolve(process.cwd(), arg);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        targetDir = resolved;
        files = getAllFiles(targetDir, /\.[tj]sx?$/);
      } else {
        targetDir = path.dirname(resolved);
        files = [resolved];
      }
    } else {
      console.error(`Path does not exist: ${resolved}`);
      process.exit(1);
    }
  } else {
    files = getAllFiles(targetDir, /\.[tj]sx?$/);
  }

  console.log(`🔎 Auditing untranslated literals in: ${arg || targetDir}`);
  const existingZh: Record<string, string> = fs.existsSync(zhDictPath)
    ? JSON.parse(fs.readFileSync(zhDictPath, 'utf-8'))
    : {};

  function isMissingTranslation(value: string, file: string): boolean {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!shouldAuditText(normalized)) return false;
    const context = getContextKey(file);
    const key = context ? `${normalized}@@${context}` : normalized;
    // The runtime checks the contextual key first, then falls back to the
    // base key. Match that lookup order so shared translations are not
    // reported as missing merely because a file has a context.
    return (
      !Object.prototype.hasOwnProperty.call(existingZh, key) &&
      !Object.prototype.hasOwnProperty.call(existingZh, normalized)
    );
  }
  const untranslated: {
    file: string;
    line: number;
    type: string;
    snippet: string;
  }[] = [];

  for (const file of files) {
    if (isIgnoredPath(file)) continue;
    const rel = path.relative(webSrcDir, file);
    const code = fs.readFileSync(file, 'utf-8');
    if (
      !file.endsWith('.tsx') &&
      !code.includes('toast') &&
      !Array.from(TRANSLATABLE_OBJECT_KEYS).some((key) =>
        code.includes(`${key}:`)
      )
    )
      continue;

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      traverse(ast, {
        JSXText(p: any) {
          const raw = p.node.value;
          if (isMissingTranslation(raw, file)) {
            untranslated.push({
              file: rel,
              line: p.node.loc?.start?.line ?? 0,
              type: 'JSXText',
              snippet: raw.trim().slice(0, 60),
            });
          }
        },
        JSXAttribute(p: any) {
          const attr = p.node.name?.name;
          if (!TRANSLATABLE_ATTRIBUTES.has(attr)) return;
          const line = p.node.loc?.start?.line ?? 0;
          const value = p.node.value;
          if (value?.type === 'StringLiteral' && isMissingTranslation(value.value, file)) {
            untranslated.push({
              file: rel,
              line,
              type: `JSXAttribute(${attr})`,
              snippet: value.value.slice(0, 60),
            });
          } else if (value?.type === 'JSXExpressionContainer') {
            const exp = value.expression;
            if (exp.type === 'StringLiteral' && isMissingTranslation(exp.value, file)) {
              untranslated.push({
                file: rel,
                line,
                type: `JSXAttribute(${attr})`,
                snippet: exp.value.slice(0, 60),
              });
            } else if (exp.type === 'TemplateLiteral') {
              const unit = parseSimpleTemplateLiteral(exp);
              if (unit && isMissingTranslation(unit.template, file)) {
                untranslated.push({
                  file: rel,
                  line,
                  type: `JSXAttribute(${attr})`,
                  snippet: unit.template.slice(0, 60),
                });
              }
            }
          }
        },
        ObjectProperty(p: any) {
          if (rel.includes('lib/service-clients/')) return;
          const propName = getObjectPropertyName(p.node.key);
          const parentCall = p.parentPath?.parentPath?.node;
          const isToastPromiseOption =
            parentCall?.type === 'CallExpression' &&
            parentCall.callee?.type === 'MemberExpression' &&
            parentCall.callee.object?.name === 'toast' &&
            parentCall.callee.property?.name === 'promise';
          if (
            !propName ||
            (!TRANSLATABLE_OBJECT_KEYS.has(propName) &&
              !(isToastPromiseOption && ['loading', 'success', 'error'].includes(propName)))
          )
            return;

          const line = p.node.loc?.start?.line ?? 0;
          const value = p.node.value;
          if (value.type === 'StringLiteral' && isMissingTranslation(value.value, file)) {
            untranslated.push({
              file: rel,
              line,
              type: `ObjectProperty(${propName})`,
              snippet: value.value.slice(0, 60),
            });
          } else if (value.type === 'TemplateLiteral') {
            const unit = parseSimpleTemplateLiteral(value);
            if (unit && isMissingTranslation(unit.template, file)) {
              untranslated.push({
                file: rel,
                line,
                type: `ObjectProperty(${propName})`,
                snippet: unit.template.slice(0, 60),
              });
            }
          }
        },
        CallExpression(p: any) {
          const callee = p.node.callee;
          const calleeName = callee.type === 'Identifier' ? callee.name : '';
          const isErrorSetter = /^set(?:Error|.*Error)$/.test(calleeName);
          const isToast =
            (callee.type === 'MemberExpression' &&
              callee.object?.name === 'toast' &&
              [
                'success',
                'error',
                'info',
                'warning',
                'loading',
                'failure',
                'alert',
                'message',
              ].includes(callee.property?.name)) ||
            (callee.type === 'Identifier' && callee.name === 'toast') ||
            isErrorSetter;

          if (!isToast || p.node.arguments.length === 0) return;

          const firstArg = p.node.arguments[0];
          const line = p.node.loc?.start?.line ?? 0;
          if (
            firstArg.type === 'StringLiteral' &&
            isMissingTranslation(firstArg.value, file)
          ) {
            untranslated.push({
              file: rel,
              line,
              type: 'Toast',
              snippet: firstArg.value.slice(0, 60),
            });
          } else if (firstArg.type === 'TemplateLiteral') {
            const unit = parseSimpleTemplateLiteral(firstArg);
            if (unit && isMissingTranslation(unit.template, file)) {
              untranslated.push({
                file: rel,
                line,
                type: 'Toast',
                snippet: unit.template.slice(0, 60),
              });
            }
          }
        },
        StringLiteral(p: any) {
          if (!isUiFallbackStringLiteral(p)) return;
          const value = p.node.value;
          if (isMissingTranslation(value, file)) {
            untranslated.push({
              file: rel,
              line: p.node.loc?.start?.line ?? 0,
              type: 'JSXFallback',
              snippet: value.slice(0, 60),
            });
          }
        },
      });
    } catch {
      // ignore parse errors for audit
    }
  }

  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(diffDir, 'audit-untranslated.json'),
    JSON.stringify(untranslated, null, 2),
    'utf-8'
  );

  const summaryByFile: Record<string, number> = {};
  for (const item of untranslated) {
    summaryByFile[item.file] = (summaryByFile[item.file] || 0) + 1;
  }

  const sortedFiles = Object.entries(summaryByFile).sort((a, b) => b[1] - a[1]);

  console.log('==========================================');
  console.log(`📋 i18n Audit Report:`);
  console.log(`  - Target:                               ${targetDir}`);
  console.log(
    `  - Potential Untranslated Literals:      ${untranslated.length}`
  );
  console.log(
    `  - Affected Files:                       ${sortedFiles.length}`
  );

  if (untranslated.length > 0) {
    console.log(`\n🔍 Untranslated Details (file:line:col):`);
    for (const item of untranslated) {
      console.log(
        `  apps/web/src/${item.file}:${item.line} [${item.type}] "${item.snippet}"`
      );
    }
  }

  console.log(
    `\nFull report saved to packages/i18n/diff/audit-untranslated.json`
  );
  console.log('==========================================');
}

audit();
