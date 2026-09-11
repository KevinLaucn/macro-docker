export const TRANSLATABLE_ATTRIBUTES = new Set([
	"placeholder",
	"title",
	"aria-label",
	"label",
	"text",
	"tooltip",
	"emptyText",
	"heading",
	"subheading",
	"description",
	"fallback",
	"allDayText",
	"confirmText",
	"cancelText",
	"buttonText",
	"message",
	"error",
	"success",
	"helperText",
	"loadingText",
	"alt",
	"confirmLabel",
	"cancelLabel",
	"actionLabel",
	"submitLabel",
	"deleteLabel",
	"searchPlaceholder",
	"emptyTitle",
	"emptyDescription",
	"badgeText",
	"headerText",
	"dialogTitle",
	"aria-description",
	"aria-roledescription",
	"caption",
	"subtitle",
	"emptyMessage",
	"helpText",
	"hint",
	"prompt",
	"summary",
]);

export const TRANSLATABLE_OBJECT_KEYS = new Set([
	"label",
	"title",
	"description",
	"placeholder",
	"tooltip",
	"emptyText",
	"heading",
	"subheading",
	"helperText",
	"loadingText",
	"confirmText",
	"cancelText",
	"buttonText",
	"confirmLabel",
	"cancelLabel",
	"actionLabel",
	"submitLabel",
	"deleteLabel",
	"searchPlaceholder",
	"emptyTitle",
	"emptyDescription",
	"badgeText",
	"headerText",
	"dialogTitle",
	"caption",
	"subtitle",
	"emptyMessage",
	"helpText",
	"hint",
	"prompt",
	"summary",
	"fullLabel",
	"shortLabel",
]);

export const IGNORED_TAGS = new Set([
	"code",
	"pre",
	"script",
	"style",
	"svg",
	"path",
]);

export const IGNORED_PATH_PATTERNS = [
	/playground/i,
	/debugger/i,
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
	return text.trim().replace(/\s+/g, " ");
}

export function shouldTranslateText(text: string): boolean {
	const normalized = normalizeText(text);
	if (!normalized || normalized.length < 2) return false;
	// Must contain at least one ASCII letter
	if (!/[a-zA-Z]/.test(normalized)) return false;
	// Ignore HTML entities like &nbsp; &amp; &times;
	if (/^&(?:nbsp|amp|quot|lt|gt|middot|times);?$/i.test(normalized))
		return false;
	// Ignore URLs, file paths, CSS selectors, MIME types, technical IDs
	if (normalized.startsWith("http://") || normalized.startsWith("https://"))
		return false;
	if (
		normalized.startsWith("/") ||
		normalized.startsWith("./") ||
		normalized.startsWith("../")
	)
		return false;
	if (/^[a-z0-9-_]+:[a-z0-9-_]+$/i.test(normalized)) return false;
	if (/^[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(normalized)) return false; // e.g. application/json
	if (/^(--|\$|\.)[a-z0-9_-]+/i.test(normalized)) return false; // css variables or classes
	if (/^\[data-/.test(normalized)) return false; // css attribute selectors
	if (/^(property|header|category|loadmore):/i.test(normalized)) return false;
	if (normalized.includes("{DOCS_BASE}")) return false;
	if (/^\{[a-z0-9_-]+\}\/\{[a-z0-9_-]+\}/i.test(normalized)) return false; // e.g. {owner}/{repo}
	// Ignore pure hex colors, uuids, css units, git shas
	if (/^#[0-9a-fA-F]{3,8}$/.test(normalized)) return false;
	if (
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			normalized,
		)
	)
		return false;
	if (/^\d+(\.\d+)?(px|rem|em|vh|vw|ms|s|%|fr)$/i.test(normalized))
		return false;
	if (/^[0-9a-f]{7,40}$/i.test(normalized)) return false;
	// Ignore CSS utility class lists (e.g. Tailwind classes in style maps)
	if (
		/(?:^|\s)(?:bg|text|border|hover|focus|active)-[a-z0-9_-]+/i.test(
			normalized,
		) &&
		normalized.includes(" ") &&
		/(?:border|surface|ink|accent)/i.test(normalized)
	) {
		return false;
	}
	return true;
}

export function getContextKey(filePath: string): string | undefined {
	const norm = filePath.replace(/\\/g, "/");
	if (norm.includes("crm")) return "crm";
	if (norm.includes("settings/team") || norm.includes("team-settings"))
		return "team";
	if (norm.includes("call") || norm.includes("call-panel")) return "call";
	if (norm.includes("activity")) return "activity";
	if (norm.includes("email")) return "email";
	if (norm.includes("chat") || norm.includes("channel")) return "chat";
	return undefined;
}

export interface InterpolatedUnit {
	template: string;
	variables: { name: string; start: number; end: number }[];
}

export function getExpressionName(node: any): string | undefined {
	if (!node) return undefined;
	if (node.type === "Identifier") {
		return node.name;
	}
	if (
		node.type === "MemberExpression" &&
		node.property?.type === "Identifier"
	) {
		return node.property.name;
	}
	return undefined;
}

export function getObjectPropertyName(node: any): string | undefined {
	if (!node) return undefined;
	if (node.type === "Identifier") return node.name;
	if (node.type === "StringLiteral") return node.value;
	return undefined;
}

export function parseMixedChildren(
	children: any[],
): InterpolatedUnit | undefined {
	if (!children || children.length <= 1) return undefined;

	let hasText = false;
	let hasExpression = false;
	const templateParts: string[] = [];
	const variables: { name: string; start: number; end: number }[] = [];

	for (const child of children) {
		if (child.type === "JSXText") {
			const norm = child.value.replace(/\s+/g, " ");
			if (norm.trim()) {
				hasText = true;
			}
			templateParts.push(norm);
		} else if (child.type === "JSXExpressionContainer") {
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
		const fullTemplate = templateParts.join("").trim().replace(/\s+/g, " ");
		if (shouldTranslateText(fullTemplate)) {
			return { template: fullTemplate, variables };
		}
	}

	return undefined;
}

export function parseSimpleTemplateLiteral(
	node: any,
): InterpolatedUnit | undefined {
	if (node.type !== "TemplateLiteral") return undefined;
	const { quasis, expressions } = node;
	if (!expressions || expressions.length === 0) return undefined;

	const variables: { name: string; start: number; end: number }[] = [];
	let template = "";

	for (let i = 0; i < quasis.length; i++) {
		template += quasis[i].value.raw.replace(/\s+/g, " ");
		if (i < expressions.length) {
			const exp = expressions[i];
			const varName = getExpressionName(exp);
			if (!varName) return undefined; // Complex expression, skip
			template += `{${varName}}`;
			variables.push({ name: varName, start: exp.start, end: exp.end });
		}
	}

	const normalized = template.trim().replace(/\s+/g, " ");
	if (shouldTranslateText(normalized)) {
		return { template: normalized, variables };
	}

	return undefined;
}
