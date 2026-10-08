import { parse } from '@babel/parser';
import traverseModule, { type NodePath } from '@babel/traverse';
import {
  normalizeText,
  shouldTranslateText,
  TRANSLATABLE_ATTRIBUTES,
  TRANSLATABLE_OBJECT_KEYS,
} from './ast-utils';

const traverse = (traverseModule as any).default || traverseModule;
type AstPath = NodePath<any>;
export type FieldFinding = {
  file: string;
  line: number;
  field: string;
  text: string;
  kind: 'unwrapped' | 'missing-translation' | 'interpolation-mismatch';
};

const fields = new Set([
  ...TRANSLATABLE_ATTRIBUTES,
  ...TRANSLATABLE_OBJECT_KEYS,
  'backLabel',
  'facts',
  'outcome',
  'content',
  'displayName',
]);
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');

/** Follow statically resolvable UI values. Never execute callbacks or user data. */
export function auditFields(
  source: string,
  file: string,
  dictionary: Record<string, string>,
  resolveImport?: (
    file: string,
    module: string,
    name: string
  ) => AstPath | undefined
): FieldFinding[] {
  const ast = parse(source, {
    sourceType: 'module',
    sourceFilename: file,
    plugins: ['jsx', 'typescript'],
  });
  const findings = new Map<string, FieldFinding>();
  const record = (
    path: AstPath,
    text: string,
    field: string,
    translated: boolean,
    context = ''
  ) => {
    text = normalizeText(text);
    if (!/[A-Za-z]/.test(text.replace(/\{\w+\}/g, ''))) return;
    if (field === 'outcome' && !/\s/.test(text)) return;
    if (!shouldTranslateText(text)) return;
    const key =
      context && dictionary[`${text}@@${context}`] !== undefined
        ? `${text}@@${context}`
        : text;
    let kind: FieldFinding['kind'] | undefined;
    if (!translated) kind = 'unwrapped';
    else if (!dictionary[key]) kind = 'missing-translation';
    else if (placeholders(text) !== placeholders(dictionary[key]))
      kind = 'interpolation-mismatch';
    if (!kind) return;
    const origin = path.node.loc?.filename ?? file;
    const line = path.node.loc?.start.line ?? 1;
    findings.set(`${origin}:${line}:${text}:${kind}`, {
      file: origin,
      line,
      field,
      text,
      kind,
    });
  };
  const value = (
    path: AstPath | undefined,
    field: string,
    translated = false,
    context = '',
    seen = new Set<any>()
  ) => {
    if (!path?.node || seen.has(path.node)) return;
    seen = new Set(seen).add(path.node);
    const follow = (next: AstPath) =>
      value(next, field, translated, context, seen);
    if (path.isStringLiteral() || path.isJSXText()) {
      record(path, path.node.value, field, translated, context);
    } else if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name)?.path;
      if (binding?.isVariableDeclarator())
        follow(binding.get('init') as AstPath);
      else if (binding?.isFunctionDeclaration()) follow(binding);
      else if (binding?.isImportSpecifier()) {
        if (!binding.parentPath.isImportDeclaration()) return;
        const imported = binding.node.imported;
        const module = binding.parentPath.node.source.value;
        const name =
          imported.type === 'Identifier' ? imported.name : imported.value;
        const resolved = resolveImport?.(
          path.node.loc?.filename ?? file,
          module,
          name
        );
        if (resolved) follow(resolved);
      }
    } else if (path.isConditionalExpression()) {
      follow(path.get('consequent') as AstPath);
      follow(path.get('alternate') as AstPath);
    } else if (path.isLogicalExpression() || path.isBinaryExpression()) {
      follow(path.get('left') as AstPath);
      follow(path.get('right') as AstPath);
    } else if (path.isTemplateLiteral()) {
      const template = path.node.quasis
        .map(
          (quasi, index: number) =>
            `${quasi.value.cooked ?? quasi.value.raw}${index < path.node.expressions.length ? `{value${index}}` : ''}`
        )
        .join('');
      record(path, template, field, translated, context);
      if (!translated)
        for (const expression of path.get('expressions') as AstPath[])
          follow(expression);
    } else if (path.isCallExpression()) {
      const callee = path.get('callee') as AstPath;
      if (callee.isIdentifier() && ['t', '__t'].includes(callee.node.name)) {
        const args = path.get('arguments') as AstPath[];
        let ctx = '';
        for (const arg of args.slice(1)) {
          if (arg.isStringLiteral()) ctx = arg.node.value;
          if (!arg.isObjectExpression()) continue;
          for (const prop of arg.get('properties') as AstPath[]) {
            if (
              !prop.isObjectProperty() ||
              prop.node.key.type !== 'Identifier' ||
              prop.node.key.name !== 'context'
            )
              continue;
            const contextValue = prop.get('value') as AstPath;
            if (contextValue.isStringLiteral()) ctx = contextValue.node.value;
          }
        }
        value(args[0], field, true, ctx, seen);
      } else if (callee.isIdentifier()) {
        follow(callee);
      } else if (
        callee.isMemberExpression() &&
        callee.node.object.type === 'Identifier' &&
        callee.node.property.type === 'Identifier' &&
        callee.node.object.name === 'JSON' &&
        callee.node.property.name === 'stringify'
      ) {
        follow((path.get('arguments') as AstPath[])[0]);
      }
    } else if (path.isMemberExpression()) {
      // Metadata dictionaries may use a dynamic selector: audit each possible static label.
      const object = path.get('object') as AstPath;
      const binding =
        object.isIdentifier() &&
        object.scope.getBinding(object.node.name)?.path;
      if (binding && binding.isVariableDeclarator()) {
        const init = binding.get('init') as AstPath;
        if (init.isObjectExpression()) {
          for (const prop of init.get('properties') as AstPath[]) {
            if (!prop.isObjectProperty()) continue;
            const name =
              prop.node.key.type === 'Identifier'
                ? prop.node.key.name
                : prop.node.key.type === 'StringLiteral'
                  ? prop.node.key.value
                  : undefined;
            const selector =
              path.node.property.type === 'StringLiteral'
                ? path.node.property.value
                : !path.node.computed &&
                    path.node.property.type === 'Identifier'
                  ? path.node.property.name
                  : undefined;
            if (selector === undefined || selector === name)
              follow(prop.get('value') as AstPath);
          }
        }
      }
    } else if (
      path.isArrowFunctionExpression() ||
      path.isFunctionExpression() ||
      path.isFunctionDeclaration() ||
      path.isObjectMethod()
    ) {
      const body = path.get('body') as AstPath;
      if (!body.isBlockStatement()) follow(body);
      else
        body.traverse({
          Function(nested: AstPath) {
            nested.skip();
          },
          ReturnStatement(returnPath: AstPath) {
            follow(returnPath.get('argument') as AstPath);
          },
        });
    } else if (path.isArrayExpression()) {
      for (const element of path.get('elements') as AstPath[]) follow(element);
    } else if (
      path.isTSAsExpression() ||
      path.isTSNonNullExpression() ||
      path.isTSSatisfiesExpression()
    ) {
      follow(path.get('expression') as AstPath);
    }
  };
  traverse(ast, {
    JSXText(path: AstPath) {
      value(path, 'JSXText');
    },
    JSXExpressionContainer(path: AstPath) {
      if (!path.parentPath.isJSXAttribute())
        value(path.get('expression') as AstPath, 'JSXExpression');
    },
    JSXAttribute(path: AstPath) {
      const name = path.node.name.name;
      if (!fields.has(name)) return;
      const attr = path.get('value') as AstPath;
      value(
        attr.isJSXExpressionContainer()
          ? (attr.get('expression') as AstPath)
          : attr,
        name
      );
    },
    ObjectProperty(path: AstPath) {
      const name = path.node.key.name ?? path.node.key.value;
      if (fields.has(name) || /^--.*label$/.test(name))
        value(path.get('value') as AstPath, name);
    },
    ObjectMethod(path: AstPath) {
      const name = path.node.key.name ?? path.node.key.value;
      if (fields.has(name)) value(path, name);
    },
    CallExpression(path: AstPath) {
      const callee = path.node.callee;
      if (callee.type === 'Identifier' && ['t', '__t'].includes(callee.name))
        value(path, 't');
      if (
        callee.type === 'MemberExpression' &&
        ['toast', 'notices', 'feedback'].includes(callee.object.name)
      ) {
        const args = path.get('arguments') as AstPath[];
        value(args[0], 'notification');
      }
      if (callee.type === 'Identifier' && callee.name === 'confirm') {
        value((path.get('arguments') as AstPath[])[0], 'confirm');
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.property.name === 'setAttribute'
      ) {
        const args = path.get('arguments') as AstPath[];
        if (fields.has(args[0]?.node.value))
          value(args[1], `DOM.${args[0].node.value}`);
      }
    },
  });
  return [...findings.values()];
}

/** Export paths retain scope bindings so imported constants/functions can be followed. */
export function exportedFields(
  source: string,
  file: string
): Map<string, AstPath> {
  const exports = new Map<string, AstPath>();
  const ast = parse(source, {
    sourceType: 'module',
    sourceFilename: file,
    plugins: ['jsx', 'typescript'],
  });
  traverse(ast, {
    ExportNamedDeclaration(path: AstPath) {
      const declaration = path.get('declaration') as AstPath;
      if (declaration.isVariableDeclaration()) {
        for (const item of declaration.get('declarations') as AstPath[]) {
          if (item.node.id.type === 'Identifier')
            exports.set(item.node.id.name, item.get('init') as AstPath);
        }
      } else if (declaration.isFunctionDeclaration())
        exports.set(declaration.node.id.name, declaration);
    },
  });
  return exports;
}
