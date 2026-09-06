// i18n translation extractor and AST quality gate analysis
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = (traverseModule as any).default || traverseModule;

const webSrcDir = path.resolve(__dirname, "../../apps/web/src");
const zhDictPath = path.resolve(__dirname, "./locales/zh-CN.json");
const diffDir = path.resolve(__dirname, "./diff");

function getAllFiles(dir: string, ext: RegExp, list: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist" && file !== ".vite") {
        getAllFiles(full, ext, list);
      }
    } else if (ext.test(file) && !file.endsWith(".d.ts")) {
      list.push(full);
    }
  }
  return list;
}

function normalizeKey(str: string): string {
  return str.trim().replace(/\s+/g, " ");
}

import {
  TRANSLATABLE_ATTRIBUTES,
  IGNORED_TAGS,
  isIgnoredPath,
  normalizeText,
  shouldTranslateText,
  getContextKey,
  parseMixedChildren,
  parseSimpleTemplateLiteral,
} from "./ast-utils";

async function run() {
  const files = getAllFiles(webSrcDir, /\.[tj]sx?$/).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx")
  );
  const testFiles = [
    ...getAllFiles(webSrcDir, /\.test\.[tj]sx?$/),
    ...getAllFiles(__dirname, /\.test\.[tj]sx?$/),
  ];

  const existingZh: Record<string, string> = fs.existsSync(zhDictPath)
    ? JSON.parse(fs.readFileSync(zhDictPath, "utf-8"))
    : {};

  const currentCalls = new Map<string, { occurrences: string[]; context?: string; explicit?: boolean }>();
  const explicitCalls = new Map<string, { occurrences: string[]; context?: string }>();
  const parseFailures: { file: string; error: string }[] = [];

  function recordCall(
    dictKey: string,
    rel: string,
    context: string | undefined,
    isExplicit = false
  ) {
    const existing = currentCalls.get(dictKey) || { occurrences: [] };
    existing.occurrences.push(rel);
    if (context) existing.context = context;
    if (isExplicit) existing.explicit = true;
    currentCalls.set(dictKey, existing);

    if (isExplicit) {
      const explicitExisting = explicitCalls.get(dictKey) || { occurrences: [] };
      explicitExisting.occurrences.push(rel);
      if (context) explicitExisting.context = context;
      explicitCalls.set(dictKey, explicitExisting);
    }
  }

  for (const file of files) {
    if (isIgnoredPath(file) && !file.startsWith(__dirname)) continue;
    const rel = path.relative(webSrcDir, file);
    const code = fs.readFileSync(file, "utf-8");

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      const fileContext = getContextKey(file);

      traverse(ast, {
        CallExpression(p: any) {
          const callee = p.node.callee;
          const isT =
            (callee.type === "Identifier" && (callee.name === "t" || callee.name === "__t")) ||
            (callee.type === "MemberExpression" &&
              callee.property?.type === "Identifier" &&
              (callee.property.name === "t" || callee.property.name === "__t"));

          if (isT && p.node.arguments.length > 0) {
            const firstArg = p.node.arguments[0];
            let rawKey: string | undefined;

            if (firstArg.type === "StringLiteral") {
              rawKey = firstArg.value;
            } else if (firstArg.type === "TemplateLiteral" && firstArg.quasis.length === 1) {
              rawKey = firstArg.quasis[0].value.raw;
            }

            if (rawKey) {
              const key = normalizeKey(rawKey);
              let context: string | undefined;

              // Extract context if present in 2nd or 3rd argument
              if (p.node.arguments.length >= 2) {
                const secondArg = p.node.arguments[1];
                if (secondArg.type === "StringLiteral") {
                  context = secondArg.value;
                } else if (secondArg.type === "ObjectExpression") {
                  for (const prop of secondArg.properties) {
                    if (
                      prop.type === "ObjectProperty" &&
                      prop.key?.name === "context" &&
                      prop.value?.type === "StringLiteral"
                    ) {
                      context = prop.value.value;
                    }
                  }
                }
              }

              const dictKey = context ? `${key}@@${context}` : key;
              recordCall(dictKey, rel, context, true);
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
              recordCall(dictKey, rel, fileContext);
            }
          }
        },
        JSXText(p: any) {
          const raw = p.node.value;
          const norm = normalizeKey(raw);
          if (shouldTranslateText(norm) || existingZh[norm]) {
            const dictKey = fileContext ? `${norm}@@${fileContext}` : norm;
            recordCall(dictKey, rel, fileContext);
          }
        },
        JSXAttribute(p: any) {
          const attrName = p.node.name?.name;
          if (TRANSLATABLE_ATTRIBUTES.has(attrName) && p.node.value?.type === "StringLiteral") {
            const val = normalizeKey(p.node.value.value);
            if (shouldTranslateText(val) || existingZh[val]) {
              const dictKey = fileContext ? `${val}@@${fileContext}` : val;
              recordCall(dictKey, rel, fileContext);
            }
          }
        },
        StringLiteral(p: any) {
          const val = normalizeKey(p.node.value);
          if (existingZh[val]) {
            recordCall(val, rel, undefined);
          }
          if (fileContext && existingZh[`${val}@@${fileContext}`]) {
            recordCall(`${val}@@${fileContext}`, rel, fileContext);
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
      const code = fs.readFileSync(file, "utf-8");
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
      traverse(ast, {
        StringLiteral(p: any) {
          const val = normalizeKey(p.node.value);
          if (existingZh[val]) {
            recordCall(val, rel, undefined, false);
          }
        },
      });
    } catch {
      // ignore test parse issues
    }
  }

  const missing: Record<string, string> = {};
  const inUse: Record<string, string[]> = {};
  const ambiguous: Record<string, string[]> = {};
  const obsolete: Record<string, string> = {};

  // inUse tracks all references across apps/web/src
  for (const [key, meta] of currentCalls.entries()) {
    inUse[key] = Array.from(new Set(meta.occurrences));
  }

  // Missing translations: only explicit t() / __t() calls that have no translation in zh-CN
  for (const [key, meta] of explicitCalls.entries()) {
    if (!existingZh[key]) {
      const baseKey = key.includes("@@") ? key.split("@@")[0] : key;
      if (!existingZh[baseKey]) {
        missing[key] = "";
      }
    }
  }

  // Ambiguous context keys: explicit calls without context that appear in > 2 files
  for (const [key, meta] of explicitCalls.entries()) {
    const uniqueOccurrences = Array.from(new Set(meta.occurrences));
    if (uniqueOccurrences.length > 2 && !key.includes("@@")) {
      ambiguous[key] = uniqueOccurrences;
    }
  }

  // Obsolete translations: keys in zh-CN that are neither in explicitCalls nor in any currentCalls
  for (const key of Object.keys(existingZh)) {
    if (!currentCalls.has(key)) {
      const baseKey = key.includes("@@") ? key.split("@@")[0] : key;
      if (!currentCalls.has(baseKey)) {
        obsolete[key] = existingZh[key];
      }
    }
  }

  if (!fs.existsSync(diffDir)) {
    fs.mkdirSync(diffDir, { recursive: true });
  }

  fs.writeFileSync(path.join(diffDir, "missing.json"), JSON.stringify(missing, null, 2), "utf-8");
  fs.writeFileSync(path.join(diffDir, "in-use.json"), JSON.stringify(inUse, null, 2), "utf-8");
  fs.writeFileSync(path.join(diffDir, "parse-failures.json"), JSON.stringify(parseFailures, null, 2), "utf-8");
  fs.writeFileSync(path.join(diffDir, "obsolete.json"), JSON.stringify(obsolete, null, 2), "utf-8");
  fs.writeFileSync(path.join(diffDir, "ambiguous.json"), JSON.stringify(ambiguous, null, 2), "utf-8");

  console.log("==========================================");
  console.log(`✅ Explicit t() Extractor Completed:`);
  console.log(`  - Explicit t() Keys Found: ${explicitCalls.size}`);
  console.log(`  - Missing in zh-CN:       ${Object.keys(missing).length}`);
  console.log(`  - Obsolete Translations:   ${Object.keys(obsolete).length}`);
  console.log(`  - Ambiguous Context Keys:  ${Object.keys(ambiguous).length}`);
  console.log(`  - Parse Failures:          ${parseFailures.length}`);
  console.log(`Reports saved in packages/i18n/diff/`);
  console.log("==========================================");
}

run();
