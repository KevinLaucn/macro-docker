import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";

const traverse = (traverseModule as any).default || traverseModule;

const webSrcDir = path.resolve(__dirname, "../../apps/web/src");
const diffDir = path.resolve(__dirname, "./diff");

const IGNORED_TAGS = new Set([
  "code",
  "pre",
  "script",
  "style",
  "svg",
  "path",
]);

const TRANSLATABLE_ATTRIBUTES = new Set([
  "placeholder",
  "title",
  "aria-label",
  "label",
  "tooltip",
  "emptyText",
  "heading",
  "subheading",
  "description",
  "confirmText",
  "cancelText",
  "buttonText",
]);

function shouldAuditText(text: string): boolean {
  const norm = text.trim().replace(/\s+/g, " ");
  if (!norm || norm.length < 2) return false;
  if (!/[a-zA-Z]/.test(norm)) return false;
  if (norm.startsWith("http://") || norm.startsWith("https://")) return false;
  if (norm.startsWith("/") || norm.startsWith("./") || norm.startsWith("../")) return false;
  if (/^[a-z0-9-_]+:[a-z0-9-_]+$/i.test(norm)) return false;
  if (/^(--|\$|\.)[a-z0-9_-]+/i.test(norm)) return false;
  if (/^\[data-/.test(norm)) return false;
  return true;
}

function getAllFiles(dir: string, ext: RegExp, list: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist" && file !== ".vite") {
        getAllFiles(full, ext, list);
      }
    } else if (ext.test(file) && !file.endsWith(".d.ts") && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx")) {
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
  const untranslated: { file: string; line: number; type: string; snippet: string }[] = [];

  for (const file of files) {
    const rel = path.relative(webSrcDir, file);
    const code = fs.readFileSync(file, "utf-8");
    if (!file.endsWith(".tsx") && !code.includes("toast")) continue;

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });

      traverse(ast, {
        JSXText(p: any) {
          const raw = p.node.value;
          if (shouldAuditText(raw)) {
            untranslated.push({
              file: rel,
              line: p.node.loc?.start?.line ?? 0,
              type: "JSXText",
              snippet: raw.trim().slice(0, 60),
            });
          }
        },
        JSXAttribute(p: any) {
          const attr = p.node.name?.name;
          if (TRANSLATABLE_ATTRIBUTES.has(attr) && p.node.value?.type === "StringLiteral") {
            const val = p.node.value.value;
            if (shouldAuditText(val)) {
              untranslated.push({
                file: rel,
                line: p.node.loc?.start?.line ?? 0,
                type: `JSXAttribute(${attr})`,
                snippet: val.slice(0, 60),
              });
            }
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
    path.join(diffDir, "audit-untranslated.json"),
    JSON.stringify(untranslated, null, 2),
    "utf-8"
  );

  const summaryByFile: Record<string, number> = {};
  for (const item of untranslated) {
    summaryByFile[item.file] = (summaryByFile[item.file] || 0) + 1;
  }

  const sortedFiles = Object.entries(summaryByFile).sort((a, b) => b[1] - a[1]);

  console.log("==========================================");
  console.log(`📋 i18n Audit Report:`);
  console.log(`  - Target:                               ${targetDir}`);
  console.log(`  - Potential Untranslated Literals:      ${untranslated.length}`);
  console.log(`  - Affected Files:                       ${sortedFiles.length}`);

  if (untranslated.length > 0) {
    console.log(`\n🔍 Untranslated Details (file:line:col):`);
    for (const item of untranslated) {
      console.log(`  apps/web/src/${item.file}:${item.line} [${item.type}] "${item.snippet}"`);
    }
  }

  console.log(`\nFull report saved to packages/i18n/diff/audit-untranslated.json`);
  console.log("==========================================");
}

audit();
