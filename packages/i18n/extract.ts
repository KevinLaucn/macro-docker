// i18n translation extractor and AST quality gate analysis
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default || traverseModule;

const webSrcDir = path.resolve(__dirname, '../../apps/web/src');
const zhDictPath = path.resolve(__dirname, './locales/zh-CN.json');
const diffDir = path.resolve(__dirname, './diff');

function getAllFiles(dir: string, ext: RegExp, list: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.vite') {
        getAllFiles(full, ext, list);
      }
    } else if (ext.test(file) && !file.endsWith('.d.ts')) {
      list.push(full);
    }
  }
  return list;
}

function normalizeKey(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

import {
  getContextKey,
  getObjectPropertyName,
  IGNORED_TAGS,
  isIgnoredPath,
  parseMixedChildren,
  parseSimpleTemplateLiteral,
  shouldTranslateText,
  TRANSLATABLE_ATTRIBUTES,
  TRANSLATABLE_OBJECT_KEYS,
} from './ast-utils';

interface LocationInfo {
  file: string;
  line: number;
  type: string;
  attrName?: string;
}

interface CallMetadata {
  occurrences: string[];
  context?: string;
  explicit?: boolean;
  locs: LocationInfo[];
}

async function run() {
  const files = getAllFiles(webSrcDir, /\.[tj]sx?$/).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx')
  );
  const testFiles = [
    ...getAllFiles(webSrcDir, /\.test\.[tj]sx?$/),
    ...getAllFiles(__dirname, /\.test\.[tj]sx?$/),
  ];

  const existingZh: Record<string, string> = fs.existsSync(zhDictPath)
    ? JSON.parse(fs.readFileSync(zhDictPath, 'utf-8'))
    : {};

  const currentCalls = new Map<string, CallMetadata>();
  const explicitCalls = new Map<string, CallMetadata>();
  const parseFailures: { file: string; error: string }[] = [];

  function recordCall(
    dictKey: string,
    rel: string,
    context: string | undefined,
    isExplicit = false,
    line = 0,
    type = 'unknown',
    attrName?: string
  ) {
    const existing = currentCalls.get(dictKey) || { occurrences: [], locs: [] };
    existing.occurrences.push(rel);
    if (line > 0) existing.locs.push({ file: rel, line, type, attrName });
    if (context) existing.context = context;
    if (isExplicit) existing.explicit = true;
    currentCalls.set(dictKey, existing);

    if (isExplicit) {
      const explicitExisting = explicitCalls.get(dictKey) || {
        occurrences: [],
        locs: [],
      };
      explicitExisting.occurrences.push(rel);
      if (line > 0)
        explicitExisting.locs.push({ file: rel, line, type: 't()' });
      if (context) explicitExisting.context = context;
      explicitCalls.set(dictKey, explicitExisting);
    }
  }

  for (const file of files) {
    if (isIgnoredPath(file) && !file.startsWith(__dirname)) continue;
    const rel = path.relative(webSrcDir, file);
    const code = fs.readFileSync(file, 'utf-8');
    const isActivityDesc =
      file.includes('describe-action') || file.includes('activity');

    try {
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });

      const fileContext = getContextKey(file);

      traverse(ast, {
        CallExpression(p: any) {
          const callee = p.node.callee;
          const isT =
            (callee.type === 'Identifier' &&
              (callee.name === 't' || callee.name === '__t')) ||
            (callee.type === 'MemberExpression' &&
              callee.property?.type === 'Identifier' &&
              (callee.property.name === 't' || callee.property.name === '__t'));

          if (isT && p.node.arguments.length > 0) {
            const firstArg = p.node.arguments[0];
            let rawKey: string | undefined;

            if (firstArg.type === 'StringLiteral') {
              rawKey = firstArg.value;
            } else if (
              firstArg.type === 'TemplateLiteral' &&
              firstArg.quasis.length === 1
            ) {
              rawKey = firstArg.quasis[0].value.raw;
            }

            if (rawKey) {
              const key = normalizeKey(rawKey);
              let context: string | undefined;

              // Extract context if present in 2nd or 3rd argument
              if (p.node.arguments.length >= 2) {
                const secondArg = p.node.arguments[1];
                if (secondArg.type === 'StringLiteral') {
                  context = secondArg.value;
                } else if (secondArg.type === 'ObjectExpression') {
                  for (const prop of secondArg.properties) {
                    if (
                      prop.type === 'ObjectProperty' &&
                      prop.key?.name === 'context' &&
                      prop.value?.type === 'StringLiteral'
                    ) {
                      context = prop.value.value;
                    }
                  }
                }
              }

              const dictKey = context ? `${key}@@${context}` : key;
              const line = p.node.loc?.start?.line ?? 0;
              recordCall(dictKey, rel, context, true, line, 't()');
            }
            return;
          }

          // Check toast calls: toast.success, toast.error, toast.info, toast.warning, toast.loading, toast(...)
          const isToast =
            (callee.type === 'MemberExpression' &&
              callee.object?.name === 'toast' &&
              [
                'success',
                'error',
                'info',
                'warning',
                'loading',
                'message',
              ].includes(callee.property?.name)) ||
            (callee.type === 'Identifier' && callee.name === 'toast');

          if (isToast && p.node.arguments.length > 0) {
            const firstArg = p.node.arguments[0];
            let rawToastText: string | undefined;
            if (firstArg.type === 'StringLiteral') {
              rawToastText = firstArg.value;
            } else if (
              firstArg.type === 'TemplateLiteral' &&
              firstArg.quasis.length === 1
            ) {
              rawToastText = firstArg.quasis[0].value.raw;
            }
            if (rawToastText) {
              const norm = normalizeKey(rawToastText);
              if (shouldTranslateText(norm) || existingZh[norm]) {
                const dictKey = fileContext ? `${norm}@@${fileContext}` : norm;
                const line = p.node.loc?.start?.line ?? 0;
                const toastProp = callee.property?.name
                  ? `toast.${callee.property.name}`
                  : 'toast';
                recordCall(dictKey, rel, fileContext, false, line, toastProp);
              }
            }
          }
        },
        JSXElement(p: any) {
          const tagName = p.node.openingElement?.name?.name;
          if (IGNORED_TAGS.has(tagName)) {
            p.skip();
            return;
          }
          const unit = parseMixedChildren(p.node.children);
          if (unit) {
            const norm = normalizeKey(unit.template);
            if (shouldTranslateText(norm) || existingZh[norm]) {
              const dictKey = fileContext ? `${norm}@@${fileContext}` : norm;
              const line = p.node.loc?.start?.line ?? 0;
              recordCall(
                dictKey,
                rel,
                fileContext,
                false,
                line,
                'JSXMixedChildren'
              );
            }
          }
        },
        JSXText(p: any) {
          const raw = p.node.value;
          const norm = normalizeKey(raw);
          if (shouldTranslateText(norm) || existingZh[norm]) {
            const dictKey = fileContext ? `${norm}@@${fileContext}` : norm;
            const line = p.node.loc?.start?.line ?? 0;
            recordCall(dictKey, rel, fileContext, false, line, 'JSXText');
          }
        },
        JSXAttribute(p: any) {
          const attrName = p.node.name?.name;
          if (TRANSLATABLE_ATTRIBUTES.has(attrName)) {
            const line = p.node.loc?.start?.line ?? 0;
            if (p.node.value?.type === 'StringLiteral') {
              const val = normalizeKey(p.node.value.value);
              if (shouldTranslateText(val) || existingZh[val]) {
                const dictKey = fileContext ? `${val}@@${fileContext}` : val;
                recordCall(
                  dictKey,
                  rel,
                  fileContext,
                  false,
                  line,
                  `JSXAttribute(${attrName})`,
                  attrName
                );
              }
            } else if (p.node.value?.type === 'JSXExpressionContainer') {
              const exp = p.node.value.expression;
              if (exp.type === 'StringLiteral') {
                const val = normalizeKey(exp.value);
                if (shouldTranslateText(val) || existingZh[val]) {
                  const dictKey = fileContext ? `${val}@@${fileContext}` : val;
                  recordCall(
                    dictKey,
                    rel,
                    fileContext,
                    false,
                    line,
                    `JSXAttribute(${attrName})`,
                    attrName
                  );
                }
              } else if (exp.type === 'TemplateLiteral') {
                if (exp.quasis.length === 1 && exp.expressions.length === 0) {
                  const val = normalizeKey(exp.quasis[0].value.raw);
                  if (shouldTranslateText(val) || existingZh[val]) {
                    const dictKey = fileContext
                      ? `${val}@@${fileContext}`
                      : val;
                    recordCall(
                      dictKey,
                      rel,
                      fileContext,
                      false,
                      line,
                      `JSXAttribute(${attrName})`,
                      attrName
                    );
                  }
                } else {
                  const unit = parseSimpleTemplateLiteral(exp);
                  if (unit) {
                    const norm = normalizeKey(unit.template);
                    if (shouldTranslateText(norm) || existingZh[norm]) {
                      const dictKey = fileContext
                        ? `${norm}@@${fileContext}`
                        : norm;
                      recordCall(
                        dictKey,
                        rel,
                        fileContext,
                        false,
                        line,
                        `JSXAttribute(${attrName})`,
                        attrName
                      );
                    }
                  }
                }
              }
            }
          }
        },
        ObjectProperty(p: any) {
          if (rel.includes('lib/service-clients/')) return;
          const propName = getObjectPropertyName(p.node.key);
          if (!propName || !TRANSLATABLE_OBJECT_KEYS.has(propName)) return;

          const line = p.node.loc?.start?.line ?? 0;
          const value = p.node.value;
          if (value.type === 'StringLiteral') {
            const val = normalizeKey(value.value);
            if (shouldTranslateText(val) || existingZh[val]) {
              const dictKey = fileContext ? `${val}@@${fileContext}` : val;
              recordCall(
                dictKey,
                rel,
                fileContext,
                false,
                line,
                `ObjectProperty(${propName})`,
                propName
              );
            }
          } else if (value.type === 'TemplateLiteral') {
            if (value.quasis.length === 1 && value.expressions.length === 0) {
              const val = normalizeKey(value.quasis[0].value.raw);
              if (shouldTranslateText(val) || existingZh[val]) {
                const dictKey = fileContext ? `${val}@@${fileContext}` : val;
                recordCall(
                  dictKey,
                  rel,
                  fileContext,
                  false,
                  line,
                  `ObjectProperty(${propName})`,
                  propName
                );
              }
            } else {
              const unit = parseSimpleTemplateLiteral(value);
              if (unit) {
                const norm = normalizeKey(unit.template);
                if (shouldTranslateText(norm) || existingZh[norm]) {
                  const dictKey = fileContext
                    ? `${norm}@@${fileContext}`
                    : norm;
                  recordCall(
                    dictKey,
                    rel,
                    fileContext,
                    false,
                    line,
                    `ObjectProperty(${propName})`,
                    propName
                  );
                }
              }
            }
          }
        },
        StringLiteral(p: any) {
          const val = normalizeKey(p.node.value);
          const line = p.node.loc?.start?.line ?? 0;
          if (existingZh[val]) {
            recordCall(val, rel, undefined, false, line, 'StringLiteral');
          }
          if (fileContext && existingZh[`${val}@@${fileContext}`]) {
            recordCall(
              `${val}@@${fileContext}`,
              rel,
              fileContext,
              false,
              line,
              'StringLiteral'
            );
          }

          if (isActivityDesc) {
            if (
              p.parent?.type === 'ReturnStatement' ||
              p.parent?.type === 'ArrowFunctionExpression'
            ) {
              if (shouldTranslateText(val) || existingZh[val]) {
                const dictKey = fileContext ? `${val}@@${fileContext}` : val;
                recordCall(
                  dictKey,
                  rel,
                  fileContext,
                  false,
                  line,
                  'ActivityDesc'
                );
              }
            }
          }
        },
      });
    } catch (err: any) {
      parseFailures.push({ file: rel, error: err?.message || String(err) });
    }
  }

  for (const file of testFiles) {
    const rel = path.relative(webSrcDir, file);
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });
      traverse(ast, {
        StringLiteral(p: any) {
          const val = normalizeKey(p.node.value);
          const line = p.node.loc?.start?.line ?? 0;
          if (existingZh[val]) {
            recordCall(val, rel, undefined, false, line, 'TestStringLiteral');
          }
        },
      });
    } catch {
      // ignore test parse issues
    }
  }

  const missing: Record<string, string> = {};
  const missingExplicit: Record<
    string,
    { locs: LocationInfo[]; context?: string }
  > = {};
  const missingUi: Record<string, { locs: LocationInfo[]; context?: string }> =
    {};
  const missingDetails: Record<
    string,
    {
      baseKey: string;
      context?: string;
      isExplicit: boolean;
      occurrences: string[];
      locs: LocationInfo[];
    }
  > = {};

  const inUse: Record<string, string[]> = {};
  const ambiguous: Record<string, string[]> = {};
  const obsolete: Record<string, string> = {};

  // inUse tracks all references across apps/web/src
  for (const [key, meta] of currentCalls.entries()) {
    inUse[key] = Array.from(new Set(meta.occurrences));
  }

  // Missing translations: comprehensive check across all extracted keys
  for (const [key, meta] of currentCalls.entries()) {
    const baseKey = key.includes('@@') ? key.split('@@')[0] : key;
    const isTranslated = Boolean(existingZh[key] || existingZh[baseKey]);
    if (!isTranslated) {
      missing[key] = '';
      const uniqueLocs = meta.locs.filter(
        (loc, idx, arr) =>
          arr.findIndex((l) => l.file === loc.file && l.line === loc.line) ===
          idx
      );
      const uniqueOccurrences = Array.from(new Set(meta.occurrences));
      missingDetails[key] = {
        baseKey,
        context: meta.context,
        isExplicit: !!meta.explicit,
        occurrences: uniqueOccurrences,
        locs: uniqueLocs,
      };

      if (meta.explicit) {
        missingExplicit[key] = { locs: uniqueLocs, context: meta.context };
      } else {
        missingUi[key] = { locs: uniqueLocs, context: meta.context };
      }
    }
  }

  // Ambiguous context keys: explicit calls without context that appear in > 2 files
  for (const [key, meta] of explicitCalls.entries()) {
    const uniqueOccurrences = Array.from(new Set(meta.occurrences));
    if (uniqueOccurrences.length > 2 && !key.includes('@@')) {
      ambiguous[key] = uniqueOccurrences;
    }
  }

  // Obsolete translations: keys in zh-CN that are neither in explicitCalls nor in any currentCalls
  for (const key of Object.keys(existingZh)) {
    if (!currentCalls.has(key)) {
      const baseKey = key.includes('@@') ? key.split('@@')[0] : key;
      if (!currentCalls.has(baseKey)) {
        obsolete[key] = existingZh[key];
      }
    }
  }

  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(diffDir, 'missing.json'),
    JSON.stringify(missing, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(diffDir, 'missing-details.json'),
    JSON.stringify(missingDetails, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(diffDir, 'in-use.json'),
    JSON.stringify(inUse, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(diffDir, 'parse-failures.json'),
    JSON.stringify(parseFailures, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(diffDir, 'obsolete.json'),
    JSON.stringify(obsolete, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(diffDir, 'ambiguous.json'),
    JSON.stringify(ambiguous, null, 2),
    'utf-8'
  );

  const explicitMissingCount = Object.keys(missingExplicit).length;
  const uiMissingCount = Object.keys(missingUi).length;
  const totalMissingCount = Object.keys(missing).length;

  console.log('==========================================');
  console.log(`✅ i18n Comprehensive Translation Sync Report:`);
  console.log(`  - Total In-Use Keys Scanned:     ${currentCalls.size}`);
  console.log(`  - Explicit t() Keys Found:       ${explicitCalls.size}`);
  console.log(`  - Missing Explicit t() in zh-CN: ${explicitMissingCount}`);
  console.log(`  - Missing UI Text/Attrs in zh-CN:${uiMissingCount}`);
  console.log(`  - Total Missing Translations:    ${totalMissingCount}`);
  console.log(
    `  - Obsolete Keys in zh-CN:        ${Object.keys(obsolete).length}`
  );
  console.log(
    `  - Ambiguous Context Keys:        ${Object.keys(ambiguous).length}`
  );
  console.log(`  - Parse Failures:                ${parseFailures.length}`);

  if (explicitMissingCount > 0) {
    console.log(
      `\n❌ Missing Explicit t() Translations (High Priority - Code calls t(), but key missing in zh-CN):`
    );
    for (const [key, item] of Object.entries(missingExplicit)) {
      const locList = item.locs.length
        ? item.locs.map((l) => `apps/web/src/${l.file}:${l.line}`).join(', ')
        : 'unknown location';
      console.log(`  - "${key}"\n    Location: ${locList}`);
    }
  }

  if (uiMissingCount > 0) {
    console.log(
      `\n⚠️  Untranslated UI Literals & Attributes (Sample of ${uiMissingCount} total):`
    );
    // Group by file for clean reading
    const byFile: Record<
      string,
      { line: number; type: string; key: string }[]
    > = {};
    for (const [key, item] of Object.entries(missingUi)) {
      for (const loc of item.locs) {
        if (!byFile[loc.file]) byFile[loc.file] = [];
        byFile[loc.file].push({ line: loc.line, type: loc.type, key });
      }
    }

    const topFiles = Object.entries(byFile).slice(0, 10);
    for (const [file, items] of topFiles) {
      console.log(`  📁 apps/web/src/${file} (${items.length} untranslated):`);
      for (const item of items.slice(0, 5)) {
        console.log(
          `     - Line ${item.line} [${item.type}]: "${item.key.slice(0, 60)}"`
        );
      }
      if (items.length > 5) {
        console.log(`     ... and ${items.length - 5} more in this file`);
      }
    }
    if (Object.keys(byFile).length > 10) {
      console.log(
        `  ... and ${Object.keys(byFile).length - 10} more files (see packages/i18n/diff/missing-details.json)`
      );
    }
  }

  const obsoleteKeys = Object.keys(obsolete);
  if (obsoleteKeys.length > 0) {
    console.log(
      `\n⚠️  Obsolete Translations (in zh-CN.json but not referenced in code):`
    );
    for (const key of obsoleteKeys) {
      console.log(`  - "${key}": "${obsolete[key]}"`);
    }
  }

  console.log(`\nDetailed reports saved in packages/i18n/diff/`);
  console.log('==========================================');
}

run();
