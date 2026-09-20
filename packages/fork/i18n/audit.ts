import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default || traverseModule;

const webSrcDir = path.resolve(__dirname, '../../../apps/web/src');
const zhDictPath = path.resolve(__dirname, './locales/zh-CN.json');
const diffDir = path.resolve(__dirname, './diff');

import {
  getContextKey,
  getObjectPropertyName,
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
      !Object.hasOwn(existingZh, key) && !Object.hasOwn(existingZh, normalized)
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
      !Array.from(TRANSLATABLE_OBJECT_KEYS).some(
        (key) => code.includes(`${key}:`) || code.includes(`get ${key}(`)
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
          const checkAttrValue = (node: any) => {
            if (!node) return;
            if (
              node.type === 'StringLiteral' &&
              isMissingTranslation(node.value, file)
            ) {
              untranslated.push({
                file: rel,
                line: node.loc?.start?.line ?? line,
                type: `JSXAttribute(${attr})`,
                snippet: node.value.slice(0, 60),
              });
            } else if (node.type === 'TemplateLiteral') {
              const unit = parseSimpleTemplateLiteral(node);
              if (unit && isMissingTranslation(unit.template, file)) {
                untranslated.push({
                  file: rel,
                  line: node.loc?.start?.line ?? line,
                  type: `JSXAttribute(${attr})`,
                  snippet: unit.template.slice(0, 60),
                });
              }
            } else if (node.type === 'ConditionalExpression') {
              checkAttrValue(node.consequent);
              checkAttrValue(node.alternate);
            } else if (node.type === 'LogicalExpression') {
              checkAttrValue(node.left);
              checkAttrValue(node.right);
            }
          };

          if (value?.type === 'StringLiteral') {
            checkAttrValue(value);
          } else if (value?.type === 'JSXExpressionContainer') {
            checkAttrValue(value.expression);
          }
        },
        ObjectProperty(p: any) {
          if (rel.includes('lib/service-clients/')) return;
          const propName = getObjectPropertyName(p.node.key);
          const parentCall = p.parentPath?.parentPath?.node;
          const isLoggingCall =
            parentCall?.type === 'CallExpression' &&
            ((parentCall.callee?.type === 'Identifier' &&
              /^(?:log|logger|track|console)/i.test(parentCall.callee.name)) ||
              (parentCall.callee?.type === 'MemberExpression' &&
                /^(?:log|logger|console)/i.test(
                  parentCall.callee.object?.name
                )));
          if (isLoggingCall) return;

          const isToastPromiseOption =
            parentCall?.type === 'CallExpression' &&
            parentCall.callee?.type === 'MemberExpression' &&
            parentCall.callee.object?.name === 'toast' &&
            parentCall.callee.property?.name === 'promise';
          if (
            !propName ||
            (!TRANSLATABLE_OBJECT_KEYS.has(propName) &&
              !(
                isToastPromiseOption &&
                [
                  'loading',
                  'success',
                  'error',
                  'description',
                  'message',
                ].includes(propName)
              ))
          )
            return;

          const line = p.node.loc?.start?.line ?? 0;
          const checkObjectValue = (valNode: any) => {
            if (!valNode) return;
            if (
              valNode.type === 'StringLiteral' &&
              isMissingTranslation(valNode.value, file)
            ) {
              untranslated.push({
                file: rel,
                line: valNode.loc?.start?.line ?? line,
                type: `ObjectProperty(${propName})`,
                snippet: valNode.value.slice(0, 60),
              });
            } else if (valNode.type === 'TemplateLiteral') {
              const unit = parseSimpleTemplateLiteral(valNode);
              if (unit && isMissingTranslation(unit.template, file)) {
                untranslated.push({
                  file: rel,
                  line: valNode.loc?.start?.line ?? line,
                  type: `ObjectProperty(${propName})`,
                  snippet: unit.template.slice(0, 60),
                });
              }
            } else if (valNode.type === 'ConditionalExpression') {
              checkObjectValue(valNode.consequent);
              checkObjectValue(valNode.alternate);
            } else if (valNode.type === 'LogicalExpression') {
              checkObjectValue(valNode.left);
              checkObjectValue(valNode.right);
            }
          };
          checkObjectValue(p.node.value);
        },
        ObjectMethod(p: any) {
          if (rel.includes('lib/service-clients/')) return;
          if (p.node.kind !== 'get' && p.node.kind !== 'method') return;
          const propName = getObjectPropertyName(p.node.key);
          if (!propName || !TRANSLATABLE_OBJECT_KEYS.has(propName)) return;

          const line = p.node.loc?.start?.line ?? 0;
          p.traverse({
            ReturnStatement(retPath: any) {
              const arg = retPath.node.argument;
              if (!arg) return;
              const checkReturnValue = (valNode: any) => {
                if (!valNode) return;
                if (
                  valNode.type === 'StringLiteral' &&
                  isMissingTranslation(valNode.value, file)
                ) {
                  untranslated.push({
                    file: rel,
                    line: valNode.loc?.start?.line ?? line,
                    type: `ObjectMethod(${propName})`,
                    snippet: valNode.value.slice(0, 60),
                  });
                } else if (valNode.type === 'TemplateLiteral') {
                  const unit = parseSimpleTemplateLiteral(valNode);
                  if (unit && isMissingTranslation(unit.template, file)) {
                    untranslated.push({
                      file: rel,
                      line: valNode.loc?.start?.line ?? line,
                      type: `ObjectMethod(${propName})`,
                      snippet: unit.template.slice(0, 60),
                    });
                  }
                } else if (valNode.type === 'ConditionalExpression') {
                  checkReturnValue(valNode.consequent);
                  checkReturnValue(valNode.alternate);
                } else if (valNode.type === 'LogicalExpression') {
                  checkReturnValue(valNode.left);
                  checkReturnValue(valNode.right);
                }
              };
              checkReturnValue(arg);
            },
          });
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
    `\nFull report saved to packages/fork/i18n/diff/audit-untranslated.json`
  );
  console.log('==========================================');
}

audit();
