import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default || traverseModule;

export const TRANSLATABLE_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'aria-label',
  'ariaLabel',
  'label',
  'text',
  'tooltip',
  'emptyText',
  'heading',
  'subheading',
  'description',
  'documentationLabel',
  'fallback',
  'allDayText',
  'confirmText',
  'cancelText',
  'buttonText',
  'message',
  'subtext',
  'error',
  'success',
  'warning',
  'info',
  'helperText',
  'loadingText',
  'alt',
  'confirmLabel',
  'cancelLabel',
  'actionLabel',
  'submitLabel',
  'deleteLabel',
  'dismissLabel',
  'disabledLabel',
  'clearLabel',
  'renameAriaLabel',
  'triggerLabel',
  'triggerAriaLabel',
  'neutralLabel',
  'labelPlural',
  'searchPlaceholder',
  'emptyTitle',
  'emptyDescription',
  'badgeText',
  'headerText',
  'dialogTitle',
  'aria-description',
  'aria-roledescription',
  'caption',
  'subtitle',
  'emptyMessage',
  'helpText',
  'hint',
  'prompt',
  'summary',
  'body',
  'desc',
  'help',
  'detail',
  'note',
  'header',
  'badge',
  'cta',
  'ctaLabel',
  'actionLabel',
  'actionText',
  'activeLabel',
  'inactiveLabel',
  'errorText',
  'successText',
  'warningText',
  'infoText',
  'loadErrorTitle',
  'toastMessage',
  'viewName',
  'pendingLabel',
  'secondaryLabel',
  'fieldLabel',
  'fieldHelp',
  'duration',
  'leader',
  'sub',
  'entryLabel',
  'blockedReason',
  'unavailableReason',
  'connectLabel',
]);

export const TRANSLATABLE_OBJECT_KEYS = new Set([
  'label',
  'title',
  'description',
  'placeholder',
  'tooltip',
  'emptyText',
  'heading',
  'subheading',
  'helperText',
  'loadingText',
  'confirmText',
  'cancelText',
  'buttonText',
  'confirmLabel',
  'cancelLabel',
  'actionLabel',
  'submitLabel',
  'deleteLabel',
  'dismissLabel',
  'clearLabel',
  'disabledLabel',
  'activeLabel',
  'inactiveLabel',
  'neutralLabel',
  'labelPlural',
  'triggerLabel',
  'searchPlaceholder',
  'emptyTitle',
  'emptyDescription',
  'badgeText',
  'headerText',
  'dialogTitle',
  'caption',
  'subtitle',
  'emptyMessage',
  'helpText',
  'hint',
  'prompt',
  'summary',
  'fullLabel',
  'shortLabel',
  'message',
  'subtext',
  'detail',
  'note',
  'errorText',
  'successText',
  'warningText',
  'infoText',
  'prettyName',
  'displayName',
  'cta',
  'ctaLabel',
  'actionText',
  'badge',
  'badgeLabel',
  'header',
  'emptyStateTitle',
  'emptyStateDescription',
  'toastMessage',
  'secondaryLabel',
  'pendingLabel',
  'fieldLabel',
  'fieldHelp',
  'successMessage',
  'errorMessage',
  'warnMessage',
  'infoMessage',
  'channelSummary',
  'entryLabel',
  'blockedReason',
  'unavailableReason',
  'connectLabel',
]);

export const IGNORED_TAGS = new Set([
  'code',
  'pre',
  'script',
  'style',
  'svg',
  'path',
]);

export const IGNORED_PATH_PATTERNS = [
  /playground/i,
  /debugger/i,
  /\/debug\//i,
  /\/lib\/graphql-cache\//i,
  /\/features\/ui-gallery\//i,
  /\/components\/ui\/.*\.docs\.[tj]sx?$/i,
  /\/collab-surface\/debug\//i,
  /\/linked-conversation\/debug\//i,
  /\/internal\/UserIconDemo\.tsx$/i,
  /\.d\.ts$/,
  /\.stories\.[tj]sx?$/,
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /node_modules/,
  /test-utils/,
  /fixtures/,
  /\/generated\//,
];

export function isIgnoredPath(filePath: string): boolean {
  return IGNORED_PATH_PATTERNS.some((pat) => pat.test(filePath));
}

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function shouldTranslateText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 2) return false;
  // Must contain at least one ASCII letter
  if (!/[a-zA-Z]/.test(normalized)) return false;
  if (/^[A-Z][A-Z0-9_ -]*$/.test(normalized)) return false; // error/status codes
  // Ignore HTML entities like &nbsp; &amp; &times;
  if (/^&(?:nbsp|amp|quot|lt|gt|middot|times);?$/i.test(normalized))
    return false;
  // Ignore URLs, file paths, CSS selectors, MIME types, technical IDs
  if (normalized.startsWith('http://') || normalized.startsWith('https://'))
    return false;
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('./') ||
    normalized.startsWith('../')
  )
    return false;
  if (/^[a-z0-9-_]+:[a-z0-9-_]+$/i.test(normalized)) return false;
  if (/^[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(normalized)) return false; // e.g. application/json
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(normalized)) return false; // technical snake_case identifiers
  if (/^[a-z]+(?:[A-Z][a-z0-9]+)+$/.test(normalized)) return false; // camelCase technical identifiers (e.g. convertHeic, zipFiles)
  if (/^var\(--[a-z0-9_-]+\)$/i.test(normalized)) return false; // CSS var(--...)
  if (/^(--|\$|\.)[a-z0-9_-]+/i.test(normalized)) return false; // css variables or classes
  if (/^\[data-/.test(normalized)) return false; // css attribute selectors
  if (/^(property|header|category|loadmore):/i.test(normalized)) return false;
  if (normalized.includes('{DOCS_BASE}')) return false;
  if (/^\{[a-z0-9_-]+\}\/\{[a-z0-9_-]+\}/i.test(normalized)) return false; // e.g. {owner}/{repo}
  // Ignore pure hex colors, uuids, css units, git shas
  if (/^#[0-9a-fA-F]{3,8}$/.test(normalized)) return false;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized
    )
  )
    return false;
  if (/^\d+(\.\d+)?(px|rem|em|vh|vw|ms|s|%|fr)$/i.test(normalized))
    return false;
  if (/^[0-9a-f]{7,40}$/i.test(normalized)) return false;
  if (/^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i.test(normalized)) return false; // dot-separated commands/keys (e.g. email.compose.edit.message)
  if (/^@?\{[a-zA-Z0-9_]+\}$/.test(normalized)) return false; // pure variable placeholder e.g. @{name}
  if (/^\{[a-zA-Z0-9_]+\}:\{[a-zA-Z0-9_]+\}$/.test(normalized)) return false; // e.g. {path}:{line}
  if (/^\(?x:\s*\{x\},\s*y:\s*\{y\}\)?$/i.test(normalized)) return false; // coordinates e.g. (x: {x}, y: {y})
  // Ignore CSS utility class lists (e.g. Tailwind classes in style maps)
  if (
    /^(?:[a-z0-9_:-]+:)*(?:bg|text|border|ring|p|px|py|m|mx|my|flex|grid|rounded|size|w|h|items|justify|inline|block|hidden|relative|absolute|fixed|overflow)-[a-z0-9_-]+/i.test(
      normalized
    ) &&
    normalized
      .split(/\s+/)
      .every((token) => /^[a-z0-9_:./[\]()%,-]+$/i.test(token))
  ) {
    return false;
  }
  return true;
}

export function getContextKey(filePath: string): string | undefined {
  const norm = filePath.replace(/\\/g, '/');
  if (norm.includes('crm')) return 'crm';
  if (norm.includes('settings/team') || norm.includes('team-settings'))
    return 'team';
  if (norm.includes('call') || norm.includes('call-panel')) return 'call';
  if (norm.includes('activity')) return 'activity';
  if (norm.includes('email')) return 'email';
  if (norm.includes('chat') || norm.includes('channel')) return 'chat';
  return undefined;
}

export interface InterpolatedUnit {
  template: string;
  variables: { name: string; start: number; end: number }[];
}

export function getExpressionName(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (
    node.type === 'MemberExpression' &&
    node.property?.type === 'Identifier'
  ) {
    return node.property.name;
  }
  if (node.type === 'CallExpression') {
    if (node.callee?.type === 'Identifier') {
      return node.callee.name;
    }
    if (node.callee?.type === 'MemberExpression') {
      return getExpressionName(node.callee.object);
    }
  }
  return undefined;
}

export function getObjectPropertyName(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return undefined;
}

/**
 * Detect string literals or template literals used as inline UI fallbacks, such as:
 *   <EmptyState documentationLabel={label ?? 'Documentation'} />
 *   <p>{isSystem ? 'Auto' : `Always ${mode}`}</p>
 *
 * These expressions are not JSXText or a literal JSX attribute value, so they
 * need an explicit AST path in the i18n audit/extractor.
 */
export function isUiFallbackExpression(path: any): boolean {
  if (!path?.node) return false;
  if (
    path.node.type !== 'StringLiteral' &&
    path.node.type !== 'TemplateLiteral'
  )
    return false;

  const parent = path.parentPath?.node;
  const isFallbackBranch =
    (parent?.type === 'LogicalExpression' &&
      (parent.operator === '??' || parent.operator === '||') &&
      parent.right === path.node) ||
    (parent?.type === 'ConditionalExpression' &&
      (parent.consequent === path.node || parent.alternate === path.node));
  if (!isFallbackBranch) return false;

  // Limit this rule to values that are directly rendered/passed through JSX.
  // This avoids treating data defaults, route identifiers, and config values
  // as user-facing copy.
  let current = path.parentPath;
  while (current) {
    if (current.node?.type === 'JSXExpressionContainer') {
      const containerParent = current.parentPath?.node;
      if (containerParent?.type === 'JSXAttribute')
        return TRANSLATABLE_ATTRIBUTES.has(containerParent.name?.name);
      return true;
    }
    if (
      current.node?.type === 'FunctionDeclaration' ||
      current.node?.type === 'FunctionExpression' ||
      current.node?.type === 'ArrowFunctionExpression'
    )
      break;
    current = current.parentPath;
  }

  return false;
}

export function isUiFallbackStringLiteral(path: any): boolean {
  return path?.node?.type === 'StringLiteral' && isUiFallbackExpression(path);
}

export function parseMixedChildren(
  children: any[]
): InterpolatedUnit | undefined {
  if (!children || children.length <= 1) return undefined;

  let hasText = false;
  let hasExpression = false;
  const templateParts: string[] = [];
  const variables: { name: string; start: number; end: number }[] = [];

  for (const child of children) {
    if (child.type === 'JSXText') {
      const norm = child.value.replace(/\s+/g, ' ');
      if (norm.trim()) {
        hasText = true;
      }
      templateParts.push(norm);
    } else if (child.type === 'JSXExpressionContainer') {
      const exp = child.expression;
      const varName = getExpressionName(exp);
      if (varName) {
        hasExpression = true;
        templateParts.push(`{${varName}}`);
        variables.push({ name: varName, start: exp.start, end: exp.end });
      } else {
        // Complex expression (e.g. ternary, function call, nested JSX) -> skip combining
        return undefined;
      }
    } else {
      // Nested JSXElement -> skip combining
      return undefined;
    }
  }

  if (hasText && hasExpression) {
    const names = new Set<string>();
    const hasDuplicates = variables.some((v) => {
      if (names.has(v.name)) return true;
      names.add(v.name);
      return false;
    });
    if (hasDuplicates) {
      return undefined;
    }

    const fullTemplate = templateParts.join('').trim().replace(/\s+/g, ' ');
    if (shouldTranslateText(fullTemplate)) {
      return { template: fullTemplate, variables };
    }
  }

  return undefined;
}

export function parseSimpleTemplateLiteral(
  node: any
): InterpolatedUnit | undefined {
  if (node.type !== 'TemplateLiteral') return undefined;
  const { quasis, expressions } = node;
  if (!expressions || expressions.length === 0) return undefined;

  const variables: { name: string; start: number; end: number }[] = [];
  let template = '';

  for (let i = 0; i < quasis.length; i++) {
    template += quasis[i].value.raw.replace(/\s+/g, ' ');
    if (i < expressions.length) {
      const exp = expressions[i];
      const varName = getExpressionName(exp);
      if (!varName) return undefined; // Complex expression, skip
      template += `{${varName}}`;
      variables.push({ name: varName, start: exp.start, end: exp.end });
    }
  }

  const normalized = template.trim().replace(/\s+/g, ' ');
  if (shouldTranslateText(normalized)) {
    return { template: normalized, variables };
  }

  return undefined;
}

/**
 * Extracts a literal string or simple template value from an AST expression node.
 */
export function extractLiteralString(node: any): string | undefined {
  if (!node) return undefined;
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral') {
    if (
      node.quasis.length === 1 &&
      (!node.expressions || node.expressions.length === 0)
    ) {
      return node.quasis[0].value.raw;
    }
    const unit = parseSimpleTemplateLiteral(node);
    if (unit) return unit.template;
  }
  return undefined;
}

/**
 * Resolves a TypeScript/JavaScript module import specifier relative to a file or aliases.
 */
export function resolveModulePath(
  importSource: string,
  fromFilePath: string,
  webSrcDir: string
): string | undefined {
  let candidateBase: string;

  if (importSource.startsWith('.')) {
    candidateBase = path.resolve(path.dirname(fromFilePath), importSource);
  } else if (importSource.startsWith('@app/')) {
    candidateBase = path.join(webSrcDir, importSource.slice(5));
  } else if (importSource.startsWith('@core/')) {
    candidateBase = path.join(webSrcDir, 'core', importSource.slice(6));
  } else if (importSource.startsWith('@features/')) {
    candidateBase = path.join(webSrcDir, 'features', importSource.slice(10));
  } else if (importSource.startsWith('@macro/')) {
    // Monorepo package imports, e.g. @macro/i18n, generally external to web src
    return undefined;
  } else {
    // node_modules or unhandled alias
    return undefined;
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx'];
  if (fs.existsSync(candidateBase) && fs.statSync(candidateBase).isFile()) {
    return candidateBase;
  }
  for (const ext of extensions) {
    const candidateFile = `${candidateBase}${ext}`;
    if (fs.existsSync(candidateFile) && fs.statSync(candidateFile).isFile()) {
      return candidateFile;
    }
  }
  for (const ext of extensions) {
    const candidateIndex = path.join(candidateBase, `index${ext}`);
    if (fs.existsSync(candidateIndex) && fs.statSync(candidateIndex).isFile()) {
      return candidateIndex;
    }
  }
  return undefined;
}

export interface SymbolExportInfo {
  literalValue?: string;
  sourceAstNode?: any;
}

const fileExportsCache = new Map<string, Map<string, SymbolExportInfo>>();

/**
 * Parses a module file and extracts top-level exported constants that resolve to string literals.
 */
export function getExportedConstants(
  filePath: string
): Map<string, SymbolExportInfo> {
  if (fileExportsCache.has(filePath)) {
    return fileExportsCache.get(filePath)!;
  }

  const exportsMap = new Map<string, SymbolExportInfo>();
  fileExportsCache.set(filePath, exportsMap);

  if (!fs.existsSync(filePath)) return exportsMap;

  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return exportsMap;
  }

  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    const localConsts = new Map<string, string>();

    traverse(ast, {
      VariableDeclaration(p: any) {
        if (p.node.kind !== 'const') return;
        for (const decl of p.node.declarations) {
          if (decl.id?.type === 'Identifier' && decl.init) {
            const literal = extractLiteralString(decl.init);
            if (literal) {
              localConsts.set(decl.id.name, literal);
              if (p.parentPath?.isExportNamedDeclaration()) {
                exportsMap.set(decl.id.name, {
                  literalValue: literal,
                  sourceAstNode: decl.init,
                });
              }
            }
          }
        }
      },
      ExportNamedDeclaration(p: any) {
        if (p.node.specifiers) {
          for (const spec of p.node.specifiers) {
            if (
              spec.type === 'ExportSpecifier' &&
              spec.local &&
              spec.exported
            ) {
              const localName = spec.local.name;
              const exportedName =
                spec.exported.type === 'Identifier'
                  ? spec.exported.name
                  : spec.exported.value;
              if (localConsts.has(localName)) {
                exportsMap.set(exportedName, {
                  literalValue: localConsts.get(localName),
                });
              }
            }
          }
        }
      },
    });
  } catch {
    // Ignore AST parse errors in dependency files
  }

  return exportsMap;
}
