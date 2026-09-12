/**
 * Non-Translatable Entity Protection Layer
 *
 * Scans text before translation to detect and protect:
 * - Email addresses
 * - URLs & protocols
 * - Domain names
 * - IPv4 / IPv6 addresses
 * - UUID / GUID / Message-ID / Hash / Token / API Key
 * - Structured identifiers: Order Number, Tracking Number, SKU, Serial Number, Reference ID, Invitation/Auth Code
 * - Technical constants: DNS types (MX, AAAA, CNAME, TXT, PTR, NS, SOA), DNS status (NOERROR, NXDOMAIN, etc.), Protocols (DNS, SMTP, HTTP, HTTPS)
 * - Custom business tech constants & acronyms (CUSTOM_TECH_CONSTANTS)
 * - Error codes & HTTP/SMTP status codes
 * - File paths & file names with extensions
 * - Key-value pair identifier values (e.g. Username: hello, Account ID: ABC123)
 * - Industrial / trade measurement units (kg, lbs, cartons, pallets, pcs, etc.)
 *
 * Uses deterministic ProtectedSpan records with stable placeholders (⟦P0⟧, ⟦P1⟧).
 * Performs strict validation on post-translation placeholders before restoration.
 */

export interface ProtectedSpan {
  start: number;
  end: number;
  originalText: string;
  type:
    | 'email'
    | 'url'
    | 'domain'
    | 'ip'
    | 'uuid'
    | 'message_id'
    | 'tracking_number'
    | 'sku_order_ref'
    | 'hash_token'
    | 'technical_constant'
    | 'status_error_code'
    | 'file_path'
    | 'structured_field_value'
    | 'currency_amount'
    | 'measurement_unit';
  placeholderId: string;
}

export interface DetectProtectedSpansResult {
  protectedText: string;
  spans: ProtectedSpan[];
  spanMap: Map<string, ProtectedSpan>;
}

// 0. Custom business technical constants & acronyms
// Easily extend this list whenever new company/protocol terms need protection
export const CUSTOM_TECH_CONSTANTS: string[] = [
  // Examples: 'FUSIONAUTH', 'MACRODB', 'OPENOPUS', 'REDIS_CACHE'
];

// 1. Email address
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// 2. URL (http, https, ftp)
const URL_RE = /\bhttps?:\/\/[^\s<>"'{}|\\^`\[\]]+/g;

// 3. IPv4 and IPv6
const IPV4_RE = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
const IPV6_RE =
  /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g;

// 4. UUID / GUID
const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

// 5. Message-ID: e.g. <CABe...@mail.gmail.com>
const MESSAGE_ID_RE = /<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}>/g;

// 6. Explicit technical constants (DNS records, statuses, protocols)
const BASE_TECH_CONSTANTS = [
  'MX',
  'AAAA',
  'CNAME',
  'TXT',
  'PTR',
  'NS',
  'SOA',
  'SRV',
  'NOERROR',
  'NXDOMAIN',
  'SERVFAIL',
  'REFUSED',
  'TIMEOUT',
  'SMTP',
  'DNS',
  'HTTPS?',
  'FTP',
  'SSH',
  'SSL',
  'TLS',
];

function buildTechConstantsRegex(): RegExp {
  const combined = [...BASE_TECH_CONSTANTS, ...CUSTOM_TECH_CONSTANTS];
  return new RegExp(`\\b(?:${combined.join('|')})\\b`, 'g');
}

// 7. Structured identifiers:
// e.g. Tracking Number: LX123456, Order Number: ORD-9872, SKU: SKU-9921, Serial Number: SN8921, Ref ID: REF123
const STRUCTURED_LABEL_VALUE_RE =
  /\b(Username|Account ID|Tracking Number|Order (?:Number|ID)|SKU|Serial (?:Number|ID)|Reference (?:Number|ID)|Ref ID|Invoice (?:Number|ID)|Verification Code|Invite Code|API Key|Token|Hash)\s*[:：]\s*([A-Za-z0-9_-]+)\b/gi;

// 8. Standalone Tracking numbers / SKU / Reference format:
// e.g. 2 uppercase letters + 9 digits + 2 letters (EMS/FedEx), or alphanumeric tracking formats (LX123456789US, 1Z9999999999999999)
const TRACKING_NUMBER_RE = /\b(?:1Z[0-9A-Z]{16}|[A-Z]{2}[0-9]{9}[A-Z]{2})\b/g;

// 9. API Keys / Hashes: e.g. 32-64 hex chars or typical API key prefixes
const HASH_KEY_RE =
  /\b(?:sk-[a-zA-Z0-9]{20,}|[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\b/g;

// 10. File paths and filenames with specific code/document extensions:
const FILE_PATH_RE =
  /(?:(?:\/[\w.-]+)+\.[a-zA-Z0-9]+|\b[a-zA-Z0-9_.-]+\.(?:pdf|docx?|xlsx?|csv|json|xml|zip|tar\.gz|png|jpe?g|svg|txt|log|sh|rs|ts|tsx|js|html))\b/g;

// 11. Error / Status codes:
const STATUS_CODE_RE =
  /\b(?:status|code|error)\s*:?\s*([45][0-9]{2}|[45]\.[0-9]\.[0-9]|0x[0-9a-fA-F]+)\b/gi;

// 12. Structured currency amounts:
const CURRENCY_AMOUNT_RE =
  /(?:[$€£¥₹₩]\s*[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:USD|EUR|GBP|JPY|CNY|RMB|CAD|AUD|HKD|SGD|CHF|INR|KRW)\b)/gi;

// 13. Standalone ISO currency codes:
const STANDALONE_CURRENCY_RE =
  /\b(?:USD|EUR|GBP|JPY|CNY|RMB|CAD|AUD|HKD|SGD|CHF|INR|KRW)\b/g;

// 14. Industrial / Trade Measurement units (compound):
const MEASUREMENT_UNIT_RE =
  /\b[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s*(?:pcs|pieces|units|items|pkg|pkgs|boxes|cartons|pallets|kg|g|mg|lbs?|oz|km|m|cm|mm|miles?|ft|in|liters?|litres?|ml|gallons?)\b/gi;

// 15. Domain pattern:
const DOMAIN_RE =
  /\b(?![0-9.]+$)(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|io|co|ai|app|dev|cn|de|uk|jp|me|info|biz|cc|tv)\b/gi;

/**
 * Scans text and collects all protected non-translatable spans.
 * Resolves overlaps conservatively, favoring the longer / earlier match.
 */
export function detectProtectedSpans(text: string): DetectProtectedSpansResult {
  if (!text) {
    return { protectedText: text, spans: [], spanMap: new Map() };
  }

  interface RawMatch {
    start: number;
    end: number;
    text: string;
    type: ProtectedSpan['type'];
  }

  const rawMatches: RawMatch[] = [];

  const collectMatches = (
    regex: RegExp,
    type: ProtectedSpan['type'],
    groupIndex = 0
  ) => {
    regex.lastIndex = 0;
    let match = regex.exec(text);
    while (match !== null) {
      const matchText = groupIndex > 0 ? match[groupIndex] : match[0];
      if (matchText) {
        let start = match.index;
        if (groupIndex > 0) {
          const prefix = match[0].slice(0, match[0].indexOf(matchText));
          start += prefix.length;
        }
        const end = start + matchText.length;

        rawMatches.push({
          start,
          end,
          text: matchText,
          type,
        });
      }
      match = regex.exec(text);
    }
  };

  // High priority: URLs, Message-IDs, Emails
  collectMatches(URL_RE, 'url');
  collectMatches(MESSAGE_ID_RE, 'message_id');
  collectMatches(EMAIL_RE, 'email');

  // Structured key-value identifiers (e.g. "Username: hello" -> protect "hello")
  collectMatches(STRUCTURED_LABEL_VALUE_RE, 'structured_field_value', 2);

  // Tracking numbers, UUIDs, IPs, Hashes
  collectMatches(TRACKING_NUMBER_RE, 'tracking_number');
  collectMatches(UUID_RE, 'uuid');
  collectMatches(IPV4_RE, 'ip');
  collectMatches(IPV6_RE, 'ip');
  collectMatches(HASH_KEY_RE, 'hash_token');

  // Currency & Measurement compounds
  collectMatches(CURRENCY_AMOUNT_RE, 'currency_amount');
  collectMatches(MEASUREMENT_UNIT_RE, 'measurement_unit');

  // File paths & filenames
  collectMatches(FILE_PATH_RE, 'file_path');

  // Technical status codes & explicit constants (including CUSTOM_TECH_CONSTANTS)
  collectMatches(STATUS_CODE_RE, 'status_error_code', 1);
  collectMatches(buildTechConstantsRegex(), 'technical_constant');
  collectMatches(STANDALONE_CURRENCY_RE, 'currency_amount');

  // Domains
  collectMatches(DOMAIN_RE, 'domain');

  // Sort matches by start position ascending, then length descending
  rawMatches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Filter out overlapping spans (keep the earlier/longer match)
  const nonOverlapping: RawMatch[] = [];
  let lastEnd = -1;

  for (const m of rawMatches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  // Build ProtectedSpans with unique placeholders ⟦P0⟧, ⟦P1⟧...
  const spans: ProtectedSpan[] = [];
  const spanMap = new Map<string, ProtectedSpan>();
  let placeholderCounter = 0;

  let protectedText = '';
  let cursor = 0;

  for (const m of nonOverlapping) {
    protectedText += text.slice(cursor, m.start);

    const placeholderId = `⟦P${placeholderCounter++}⟧`;
    const span: ProtectedSpan = {
      start: m.start,
      end: m.end,
      originalText: m.text,
      type: m.type,
      placeholderId,
    };

    spans.push(span);
    spanMap.set(placeholderId, span);

    protectedText += placeholderId;
    cursor = m.end;
  }

  protectedText += text.slice(cursor);

  return {
    protectedText,
    spans,
    spanMap,
  };
}

/**
 * Validates that all placeholders in spanMap exist in translatedText:
 * - Exactly once each
 * - No missing placeholders
 * - No duplicated or extra placeholders
 */
export function validatePlaceholders(
  translatedText: string,
  spanMap: Map<string, ProtectedSpan>
): boolean {
  if (spanMap.size === 0) return true;
  if (!translatedText) return false;

  const foundPlaceholders =
    translatedText.match(/(?:⟦|\[|\{|【)\s*[Pp](\d+)\s*(?:⟧|\]|\}|】)/g) || [];

  if (foundPlaceholders.length !== spanMap.size) {
    return false;
  }

  const seenIndices = new Set<string>();
  for (const found of foundPlaceholders) {
    const match = found.match(/\d+/);
    if (!match) return false;
    const idx = match[0];
    if (seenIndices.has(idx)) {
      return false;
    }
    seenIndices.add(idx);

    const expectedKey = `⟦P${idx}⟧`;
    if (!spanMap.has(expectedKey)) {
      return false;
    }
  }

  return seenIndices.size === spanMap.size;
}

/**
 * Restores original non-translatable text into the translated text.
 * Strictly verifies placeholder integrity.
 * If validation fails, returns the original text without mangling.
 */
export function restoreProtectedSpans(
  translatedText: string,
  originalText: string,
  spanMap: Map<string, ProtectedSpan>
): string {
  if (spanMap.size === 0) {
    return translatedText;
  }

  if (!validatePlaceholders(translatedText, spanMap)) {
    console.warn(
      '[EmailTranslation] Placeholder validation failed! Falling back to original text to protect entities.',
      { translatedText, originalText }
    );
    return originalText;
  }

  let restored = translatedText;

  spanMap.forEach((span, placeholder) => {
    restored = restored.split(placeholder).join(span.originalText);

    const match = placeholder.match(/\d+/);
    const indexStr = match ? match[0] : '';
    if (indexStr) {
      const flexibleRegex = new RegExp(
        `(?:⟦|\\[|\\{|【)\\s*[Pp]${indexStr}\\s*(?:⟧|\\]|\\}|】)`,
        'gi'
      );
      restored = restored.replace(flexibleRegex, () => span.originalText);
    }
  });

  return restored;
}

// Backward compatibility aliases for existing callers
export const protectTokens = (text: string) => {
  const result = detectProtectedSpans(text);
  const tokenMap = new Map<string, string>();
  result.spanMap.forEach((span, placeholder) => {
    tokenMap.set(placeholder, span.originalText);
  });
  return {
    protectedText: result.protectedText,
    tokenMap,
    spans: result.spans,
    spanMap: result.spanMap,
  };
};

export const restoreTokens = (
  translatedText: string,
  tokenMap: Map<string, string>,
  _originalText?: string
) => {
  if (!translatedText || tokenMap.size === 0) return translatedText;

  let restored = translatedText;
  tokenMap.forEach((original, placeholder) => {
    restored = restored.split(placeholder).join(original);
    const match = placeholder.match(/\d+/);
    const indexStr = match ? match[0] : '';
    if (indexStr) {
      const flexibleRegex = new RegExp(
        `(?:⟦|\\[|\\{|【)\\s*[PpTtKkNn]+${indexStr}\\s*(?:⟧|\\]|\\}|】)`,
        'gi'
      );
      restored = restored.replace(flexibleRegex, () => original);
    }
  });

  return restored;
};

// ────────────────────────────────────────────────────────────────────
// Structural Label/Value Entity Protection (DOM-based, not regex-based)
// ────────────────────────────────────────────────────────────────────

/**
 * Labels whose corresponding value should be protected from translation.
 * Matched case-insensitively against the text content of the sibling/label cell.
 */
const PROTECTED_VALUE_LABELS = new Set([
  // English
  'name',
  'company',
  'organization',
  'organisation',
  'domain',
  'website',
  'email',
  'e-mail',
  'account',
  'account id',
  'account number',
  'account no',
  'payment profile',
  'payment profile id',
  'profile id',
  'customer id',
  'customer number',
  'order id',
  'order number',
  'order no',
  'sku',
  'tracking number',
  'tracking id',
  'invoice id',
  'invoice number',
  'invoice no',
  'reference',
  'reference id',
  'ref id',
  'serial number',
  'serial no',
  'phone',
  'phone number',
  'tel',
  'telephone',
  'fax',
  'mobile',
  'username',
  'user name',
  'user id',
  'login',
  'password',
  'api key',
  'token',
  'verification code',
  'invite code',
  'auth code',
  // German
  'firma',
  'webseite',
  'konto',
  'kontonummer',
  'konto-id',
  'kunden-id',
  'kundennummer',
  'bestell-id',
  'bestellnummer',
  'bestell-nr',
  'rechnungs-id',
  'rechnungsnummer',
  'rechnungs-nr',
  'telefon',
  'telefonnummer',
  'benutzername',
  'benutzer-id',
  'passwort',
  // Chinese
  '姓名',
  '名称',
  '公司',
  '企业',
  '组织',
  '域名',
  '网址',
  '网站',
  '邮箱',
  '电子邮箱',
  '账号',
  '账户',
  '账号id',
  '账户id',
  '账号编号',
  '客户id',
  '客户编号',
  '订单编号',
  '订单号',
  '订单id',
  '发票编号',
  '发票号',
  '物流单号',
  '快递单号',
  '运单号',
  '序列号',
  '电话',
  '手机',
  '手机号',
  '联系电话',
  '用户名',
  '用户id',
  '密码',
  '验证码',
  '授权码',
]);

const INLINE_LABEL_TAGS = new Set([
  'SPAN',
  'LABEL',
  'DT',
  'B',
  'STRONG',
  'EM',
  'I',
  'CODE',
]);

/**
 * Checks if a label text (normalized) matches a known protected value label.
 */
function isProtectedLabel(labelText: string): boolean {
  const normalized = labelText
    .toLowerCase()
    .replace(/[:：\s]+$/g, '')
    .trim();
  return PROTECTED_VALUE_LABELS.has(normalized);
}

/**
 * Determines if a TextNode is the "value" side of a label-value pair in the DOM.
 * This uses structural DOM context (table rows, sibling elements) rather than
 * regex matching on text content, avoiding false positives in prose.
 *
 * Recognized patterns:
 * 1. Table/DL: <tr><td>Label</td><td>[VALUE TextNode]</td></tr> or <dt>Label</dt><dd>[VALUE]</dd>
 * 2. Nested sibling: <div><span>Label</span><strong>[VALUE TextNode]</strong></div>
 * 3. Direct inline sibling: <div><span>Label:</span> [VALUE TextNode]</div>
 * 4. Grandparent cell: <td><strong>[VALUE TextNode]</strong></td> preceded by label cell
 *
 * @returns true if the TextNode should be PROTECTED (not translated)
 */
export function isStructuralValueNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  if (!parent) return false;

  // Pattern 1: Table cell / Definition item — check previous sibling cell
  const parentTag = parent.tagName.toUpperCase();
  if (parentTag === 'TD' || parentTag === 'TH' || parentTag === 'DD') {
    const prevSibling = parent.previousElementSibling;
    if (
      prevSibling &&
      (prevSibling.tagName.toUpperCase() === 'TD' ||
        prevSibling.tagName.toUpperCase() === 'TH' ||
        prevSibling.tagName.toUpperCase() === 'DT')
    ) {
      const labelText = prevSibling.textContent || '';
      if (isProtectedLabel(labelText)) {
        return true;
      }
    }
  }

  // Pattern 2: Nested inline sibling — parent element is preceded by an inline label
  // e.g. <div><span>Name</span><strong>ChnPrint Studio</strong></div>
  const prevEl = parent.previousElementSibling;
  if (prevEl && INLINE_LABEL_TAGS.has(prevEl.tagName.toUpperCase())) {
    const labelText = prevEl.textContent || '';
    if (isProtectedLabel(labelText)) {
      return true;
    }
  }

  // Pattern 2b: Direct inline sibling within the same parent
  // e.g. <div><span>Name:</span> ChnPrint Studio</div> or <p><strong>Domain:</strong> chnprints.com</p>
  let prevSiblingNode = textNode.previousSibling;
  while (
    prevSiblingNode &&
    prevSiblingNode.nodeType === 3 && // Text node
    !(prevSiblingNode.nodeValue || '').trim()
  ) {
    prevSiblingNode = prevSiblingNode.previousSibling;
  }
  if (prevSiblingNode && prevSiblingNode.nodeType === 1) {
    // Element node
    const prevInlineEl = prevSiblingNode as Element;
    if (INLINE_LABEL_TAGS.has(prevInlineEl.tagName.toUpperCase())) {
      const labelText = prevInlineEl.textContent || '';
      if (isProtectedLabel(labelText)) {
        return true;
      }
    }
  }

  // Pattern 3: Grandparent is TD/TH/DD with previous sibling label cell
  // e.g. <td><strong>Value</strong></td>
  const grandparent = parent.parentElement;
  if (grandparent) {
    const gpTag = grandparent.tagName.toUpperCase();
    if (gpTag === 'TD' || gpTag === 'TH' || gpTag === 'DD') {
      const prevCell = grandparent.previousElementSibling;
      if (
        prevCell &&
        (prevCell.tagName.toUpperCase() === 'TD' ||
          prevCell.tagName.toUpperCase() === 'TH' ||
          prevCell.tagName.toUpperCase() === 'DT')
      ) {
        const labelText = prevCell.textContent || '';
        if (isProtectedLabel(labelText)) {
          return true;
        }
      }
    }
  }

  return false;
}
