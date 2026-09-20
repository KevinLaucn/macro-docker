import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import {
  getContextKey,
  IGNORED_TAGS,
  isIgnoredPath,
  isUiFallbackStringLiteral,
  normalizeText,
  parseMixedChildren,
  parseSimpleTemplateLiteral,
  shouldTranslateText,
  TRANSLATABLE_ATTRIBUTES,
  TRANSLATABLE_OBJECT_KEYS,
} from './ast-utils';

const traverse = (traverseModule as any).default || traverseModule;

export interface I18nAstPluginOptions {
  /**
   * Optional pattern or path list to restrict AST transform strictly to legacy files.
   * If provided, any file not matching legacyAllowlist will bypass AST transform.
   */
  legacyAllowlist?: (string | RegExp)[];

  /**
   * Optional paths/patterns to explicitly exclude from AST transformation
   * (e.g. newly created or refactored 2nd-gen modules using explicit t()).
   */
  excludePatterns?: (string | RegExp)[];
}

export function i18nAstPlugin(options: I18nAstPluginOptions = {}): Plugin {
  return {
    name: 'vite-plugin-i18n-ast',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[tj]sx?$/.test(id)) return null;
      if (
        id.includes('node_modules') ||
        id.includes('.test.') ||
        id.includes('.spec.') ||
        id.includes('packages/fork/i18n') ||
        isIgnoredPath(id)
      ) {
        return null;
      }

      const normalizedId = id.replace(/\\/g, '/');

      // Check explicit exclusion list for migrated modules
      if (options.excludePatterns && options.excludePatterns.length > 0) {
        const isExcluded = options.excludePatterns.some((rule) =>
          typeof rule === 'string'
            ? normalizedId.includes(rule)
            : rule.test(normalizedId)
        );
        if (isExcluded) {
          return null;
        }
      }

      // If legacyAllowlist is configured, only transform files matching allowlist
      if (options.legacyAllowlist && options.legacyAllowlist.length > 0) {
        const matched = options.legacyAllowlist.some((rule) =>
          typeof rule === 'string'
            ? normalizedId.includes(rule)
            : rule.test(normalizedId)
        );
        if (!matched) {
          return null;
        }
      }

      const isTsx = /\.[tj]sx$/.test(id);
      const isActivityDesc =
        id.includes('describe-action') || id.includes('activity');
      const hasToast = code.includes('toast');
      const hasObjectKeys = Array.from(TRANSLATABLE_OBJECT_KEYS).some(
        (key) => code.includes(`${key}:`) || code.includes(`get ${key}(`)
      );

      // Quick early exit for plain .ts files that don't have toasts or translatable keys or action descriptions
      if (!isTsx && !isActivityDesc && !hasToast && !hasObjectKeys) {
        return null;
      }

      let ast: any;
      try {
        ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        });
      } catch {
        return null;
      }

      const s = new MagicString(code);
      let transformed = false;
      const contextKey = getContextKey(id);
      const ctxArg = contextKey ? `, ${JSON.stringify(contextKey)}` : '';

      traverse(ast, {
        JSXElement(path: any) {
          const tagName = path.node.openingElement.name.name;
          if (IGNORED_TAGS.has(tagName)) {
            path.skip();
            return;
          }
          const unit = parseMixedChildren(path.node.children);
          if (unit && path.node.children.length > 0) {
            const names = new Set<string>();
            const hasDuplicates = unit.variables.some((v) => {
              if (names.has(v.name)) return true;
              names.add(v.name);
              return false;
            });
            if (hasDuplicates) {
              path.skip();
              return;
            }
            const firstChild = path.node.children[0];
            const lastChild = path.node.children[path.node.children.length - 1];
            const escaped = JSON.stringify(unit.template);
            const varObj = `{ ${unit.variables
              .map((v) => `${v.name}: ${code.slice(v.start, v.end)}`)
              .join(', ')} }`;
            s.overwrite(
              firstChild.start,
              lastChild.end,
              `{__t(${escaped}, ${varObj}${ctxArg})}`
            );
            transformed = true;
            path.skip();
            return;
          }
        },
        JSXExpressionContainer(path: any) {
          if (path.parent?.type === 'JSXAttribute') {
            const attrName = path.parent.name?.name;
            if (!TRANSLATABLE_ATTRIBUTES.has(attrName)) {
              return;
            }
          }
          if (path.node.expression?.type === 'TemplateLiteral') {
            const unit = parseSimpleTemplateLiteral(path.node.expression);
            if (unit) {
              const names = new Set<string>();
              const hasDuplicates = unit.variables.some((v) => {
                if (names.has(v.name)) return true;
                names.add(v.name);
                return false;
              });
              if (hasDuplicates) {
                return;
              }
              const escaped = JSON.stringify(unit.template);
              const varObj = `{ ${unit.variables
                .map((v) => `${v.name}: ${code.slice(v.start, v.end)}`)
                .join(', ')} }`;
              s.overwrite(
                path.node.expression.start,
                path.node.expression.end,
                `__t(${escaped}, ${varObj}${ctxArg})`
              );
              transformed = true;
              path.skip();
            }
          }
        },
        JSXText(path: any) {
          const raw = path.node.value;
          const normalized = normalizeText(raw);
          if (shouldTranslateText(normalized)) {
            const escaped = JSON.stringify(normalized);
            const leadingWs = raw.match(/^\s*/)?.[0] || '';
            const trailingWs = raw.match(/\s*$/)?.[0] || '';
            s.overwrite(
              path.node.start,
              path.node.end,
              `${leadingWs}{__t(${escaped}${ctxArg})}${trailingWs}`
            );
            transformed = true;
          }
        },
        JSXAttribute(path: any) {
          const attrName = path.node.name?.name;
          if (!TRANSLATABLE_ATTRIBUTES.has(attrName)) return;

          if (path.node.value?.type === 'StringLiteral') {
            const val = normalizeText(path.node.value.value);
            if (shouldTranslateText(val)) {
              const escaped = JSON.stringify(val);
              s.overwrite(
                path.node.value.start,
                path.node.value.end,
                `{__t(${escaped}${ctxArg})}`
              );
              transformed = true;
            }
          } else if (path.node.value?.type === 'JSXExpressionContainer') {
            const exp = path.node.value.expression;
            const checkExp = (node: any) => {
              if (!node) return;
              if (node.type === 'StringLiteral') {
                const val = normalizeText(node.value);
                if (shouldTranslateText(val)) {
                  s.overwrite(
                    node.start,
                    node.end,
                    `__t(${JSON.stringify(val)}${ctxArg})`
                  );
                  transformed = true;
                }
              } else if (node.type === 'ConditionalExpression') {
                checkExp(node.consequent);
                checkExp(node.alternate);
              }
            };
            checkExp(exp);
          }
        },
        CallExpression(path: any) {
          const callee = path.node.callee;
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
            (callee.type === 'Identifier' && callee.name === 'toast');

          if (isToast && path.node.arguments.length > 0) {
            const firstArg = path.node.arguments[0];
            if (firstArg.type === 'StringLiteral') {
              const text = normalizeText(firstArg.value);
              if (shouldTranslateText(text)) {
                const escaped = JSON.stringify(text);
                s.overwrite(
                  firstArg.start,
                  firstArg.end,
                  `__t(${escaped}${ctxArg})`
                );
                transformed = true;
              }
            } else if (firstArg.type === 'TemplateLiteral') {
              const unit = parseSimpleTemplateLiteral(firstArg);
              if (unit) {
                const varObj = `{ ${unit.variables
                  .map((v) => `${v.name}: ${code.slice(v.start, v.end)}`)
                  .join(', ')} }`;
                s.overwrite(
                  firstArg.start,
                  firstArg.end,
                  `__t(${JSON.stringify(unit.template)}, ${varObj}${ctxArg})`
                );
                transformed = true;
              }
            }
          }

          const calleeName = callee.type === 'Identifier' ? callee.name : '';
          if (
            /^set(?:Error|.*Error)$/.test(calleeName) &&
            path.node.arguments.length > 0
          ) {
            const firstArg = path.node.arguments[0];
            if (firstArg.type === 'StringLiteral') {
              const text = normalizeText(firstArg.value);
              if (shouldTranslateText(text)) {
                s.overwrite(
                  firstArg.start,
                  firstArg.end,
                  `__t(${JSON.stringify(text)}${ctxArg})`
                );
                transformed = true;
              }
            }
          }
        },
        ObjectProperty(path: any) {
          const propName = path.node.key?.name ?? path.node.key?.value;
          const parentCall = path.parentPath?.parentPath?.node;
          const isToastPromiseOption =
            parentCall?.type === 'CallExpression' &&
            parentCall.callee?.type === 'MemberExpression' &&
            parentCall.callee.object?.name === 'toast' &&
            parentCall.callee.property?.name === 'promise';
          if (
            !TRANSLATABLE_OBJECT_KEYS.has(propName) &&
            !(
              isToastPromiseOption &&
              [
                'loading',
                'success',
                'error',
                'description',
                'message',
              ].includes(propName)
            )
          )
            return;
          const checkObjectValue = (valueNode: any) => {
            if (!valueNode) return;
            if (valueNode.type === 'StringLiteral') {
              const text = normalizeText(valueNode.value);
              if (shouldTranslateText(text)) {
                s.overwrite(
                  valueNode.start,
                  valueNode.end,
                  `__t(${JSON.stringify(text)}${ctxArg})`
                );
                transformed = true;
              }
            } else if (valueNode.type === 'ConditionalExpression') {
              checkObjectValue(valueNode.consequent);
              checkObjectValue(valueNode.alternate);
            }
          };
          checkObjectValue(path.node.value);
        },
        ObjectMethod(path: any) {
          if (path.node.kind !== 'get' && path.node.kind !== 'method') return;
          const propName = path.node.key?.name ?? path.node.key?.value;
          if (!propName || !TRANSLATABLE_OBJECT_KEYS.has(propName)) return;
          path.traverse({
            ReturnStatement(retPath: any) {
              const arg = retPath.node.argument;
              const checkReturnValue = (valNode: any) => {
                if (!valNode) return;
                if (valNode.type === 'StringLiteral') {
                  const text = normalizeText(valNode.value);
                  if (shouldTranslateText(text)) {
                    s.overwrite(
                      valNode.start,
                      valNode.end,
                      `__t(${JSON.stringify(text)}${ctxArg})`
                    );
                    transformed = true;
                  }
                } else if (valNode.type === 'ConditionalExpression') {
                  checkReturnValue(valNode.consequent);
                  checkReturnValue(valNode.alternate);
                }
              };
              checkReturnValue(arg);
            },
          });
        },
        StringLiteral(path: any) {
          if (!isUiFallbackStringLiteral(path)) return;
          const text = normalizeText(path.node.value);
          if (shouldTranslateText(text)) {
            s.overwrite(
              path.node.start,
              path.node.end,
              `__t(${JSON.stringify(text)}${ctxArg})`
            );
            transformed = true;
          }
        },
        ReturnStatement(path: any) {
          if (isActivityDesc && path.node.argument?.type === 'StringLiteral') {
            const text = normalizeText(path.node.argument.value);
            if (shouldTranslateText(text)) {
              const escaped = JSON.stringify(text);
              s.overwrite(
                path.node.argument.start,
                path.node.argument.end,
                `__t(${escaped}${ctxArg})`
              );
              transformed = true;
            }
          }
        },
        ArrowFunctionExpression(path: any) {
          if (isActivityDesc && path.node.body?.type === 'StringLiteral') {
            const text = normalizeText(path.node.body.value);
            if (shouldTranslateText(text)) {
              const escaped = JSON.stringify(text);
              s.overwrite(
                path.node.body.start,
                path.node.body.end,
                `__t(${escaped}${ctxArg})`
              );
              transformed = true;
            }
          }
        },
      });

      if (transformed) {
        if (!code.includes('@macro/i18n')) {
          s.prepend(`import { __t } from "@macro/i18n";\n`);
        }
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };
      }

      return null;
    },
  };
}

export default i18nAstPlugin;
