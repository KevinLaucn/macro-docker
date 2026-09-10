// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyDetector } from './languageDetector';
import { planAndTranslateText } from './textPlanner';
import { detectProtectedSpans, restoreProtectedSpans } from './tokenProtection';
import {
  clearTranslationCache,
  getCachedText,
  setCachedText,
} from './translationCache';
import { planAndTranslateHtml } from './translationPlanner';
import { destroyAllTranslators } from './translatorClient';

describe('DOM-aware Email Translation Planner', () => {
  let mockTranslateFn: any;
  let mockDetectFn: any;

  beforeEach(() => {
    destroyAllTranslators();
    destroyDetector();
    clearTranslationCache();

    mockTranslateFn = vi.fn(async (text: string) => {
      // Mock translator behavior: prefix with "[译] "
      return `[译] ${text}`;
    });

    mockDetectFn = vi.fn(async (text: string) => {
      // Simple heuristic for mock LanguageDetector
      if (/[\u4e00-\u9fa5]/.test(text)) {
        return [{ detectedLanguage: 'zh', confidence: 0.99 }];
      }
      return [{ detectedLanguage: 'en', confidence: 0.95 }];
    });

    (globalThis as any).LanguageDetector = {
      create: vi.fn(async () => ({
        detect: mockDetectFn,
        destroy: vi.fn(),
      })),
    };

    (globalThis as any).Translator = {
      availability: vi.fn(async () => 'readily'),
      create: vi.fn(async ({ _sourceLanguage, _targetLanguage }: any) => ({
        translate: mockTranslateFn,
        destroy: vi.fn(),
      })),
    };
  });

  // CASE 1: 真实 DSN 邮件测试 (中英混合)
  it('CASE 1: DSN mixed language email keeps Chinese intact and translates English DNS Error', async () => {
    const inputHtml = `
      <div>
        <p>找不到地址</p>
        <p>系统找不到网域 test.com，因此无法将您的邮件递送至 test@test.com。请检查该网域名称是否书写正确或存在多余的空格，然后重试。</p>
        <p>响应如下：</p>
        <p>DNS Error: DNS type 'mx' lookup of test.com responded with code NOERROR DNS type 'mx' lookup of test.com had no relevant answers.</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    // 中文段落应 100% 保持原文
    expect(result).toContain('找不到地址');
    expect(result).toContain(
      '系统找不到网域 test.com，因此无法将您的邮件递送至 test@test.com。请检查该网域名称是否书写正确或存在多余的空格，然后重试。'
    );
    expect(result).toContain('响应如下：');

    // 绝对不能把“找不到地址”翻译成“平地城镇”
    expect(result).not.toContain('平地城镇');
    expect(result).not.toContain('下一篇');

    // 英文 DNS Error 必须被翻译
    expect(result).toContain('[译]');

    // 保护 token (test.com, test@test.com, mx, NOERROR) 必须保持原样
    expect(result).toContain('test.com');
    expect(result).toContain('test@test.com');
    expect(result).toContain('mx');
    expect(result).toContain('NOERROR');
  });

  // CASE 2: 100% 中文邮件
  it('CASE 2: 100% Chinese email invokes Translator 0 times when target is zh', async () => {
    const inputHtml = `
      <div>
        <h1>项目周报</h1>
        <p>本周我们完成了微服务架构梳理和数据库性能调优。</p>
        <p>下周计划推进前端组件库升级与国际化支持。</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect(result).toContain('项目周报');
    expect(result).toContain('本周我们完成了微服务架构梳理和数据库性能调优。');
    expect(mockTranslateFn).toHaveBeenCalledTimes(0);
  });

  // CASE 3: 100% 英文邮件
  it('CASE 3: 100% English email is detected as en and translated', async () => {
    const inputHtml = `
      <div>
        <h1>Weekly Status Report</h1>
        <p>All microservices are functioning normally without latency degradation.</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect(result).toContain('[译]');
    expect(mockTranslateFn).toHaveBeenCalled();
  });

  // CASE 4: 单个 Paragraph 中英混合
  it('CASE 4: Mixed Chinese and English in a single paragraph keeps Chinese intact and preserves email', async () => {
    const inputText =
      '客户已经回复。Please send the revised invoice to test@test.com tomorrow.';
    const result = await planAndTranslateText(inputText, { targetLang: 'zh' });

    expect(result).toContain('客户已经回复。');
    expect(result).toContain('test@test.com');
    expect(result).toContain('[译]');
  });

  // CASE 5: Inline markup 结构与属性保护
  it('CASE 5: Preserves inline tags (strong, a) hierarchy, href, and attributes', async () => {
    const inputHtml = `
      <p>
        DNS <strong>Error</strong>: lookup of
        <a href="https://example.com" class="link-blue" data-test="anchor">test.com</a>
        failed.
      </p>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('class="link-blue"');
    expect(result).toContain('data-test="anchor"');
    expect(result).toContain('<strong>');
    expect(result).toContain('</a>');
    expect(result).toContain('test.com');
  });

  // CASE 6: 连续多语言独立判断
  it('CASE 6: Independent run decisions for alternating languages', async () => {
    const inputHtml = `
      <div>
        <p>第一段：这是纯中文通知。</p>
        <p>Second paragraph: Server overload detected.</p>
        <p>第三段：请运维人员及时响应。</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect(result).toContain('第一段：这是纯中文通知。');
    expect(result).toContain('第三段：请运维人员及时响应。');
    expect(result).toContain('[译]');
  });

  it('CASE 6b: Latin-script mixed languages are translated as separate runs', async () => {
    mockDetectFn.mockImplementation(async (text: string) => {
      if (text.includes('Mit freundlichen')) {
        return [{ detectedLanguage: 'de', confidence: 0.95 }];
      }
      return [{ detectedLanguage: 'en', confidence: 0.95 }];
    });

    const inputHtml = `
      <p>Hello, Just one side is printed with letterpress. Mit freundlichen Grüßen Steffen Repplinger Strategic Print Buyer</p>
    `;

    await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });
    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'de',
      targetLanguage: 'zh',
    });
  });

  it('CASE 6c: German email phrases override bad short-text detector guesses', async () => {
    mockDetectFn.mockResolvedValue([
      { detectedLanguage: 'hu', confidence: 0.95 },
    ]);

    await planAndTranslateText('Mit freundlichen Grüßen', { targetLang: 'zh' });

    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'de',
      targetLanguage: 'zh',
    });
    expect((globalThis as any).Translator.create).not.toHaveBeenCalledWith({
      sourceLanguage: 'hu',
      targetLanguage: 'zh',
    });
  });

  it('CASE 6d: Unsupported detector guesses fall back to English', async () => {
    mockDetectFn.mockResolvedValue([
      { detectedLanguage: 'km', confidence: 0.95 },
    ]);

    await planAndTranslateText('Hello, do you have a photo of the back?', {
      targetLang: 'zh',
    });

    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });
    expect((globalThis as any).Translator.create).not.toHaveBeenCalledWith({
      sourceLanguage: 'km',
      targetLanguage: 'zh',
    });
  });

  // CASE 7: 局部翻译失败隔离 (Failure isolation)
  it('CASE 7: Segment failure preserves original text and does not shift other segments', async () => {
    mockTranslateFn = vi.fn(async (text: string) => {
      if (text.includes('FAIL_ME')) {
        throw new Error('Translator crash');
      }
      return `[译] ${text}`;
    });

    const inputHtml = `
      <div>
        <p>First paragraph: OK to translate.</p>
        <p>Second paragraph: FAIL_ME should be kept intact.</p>
        <p>Third paragraph: OK to translate as well.</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    expect(result).toContain('[译]');
    expect(result).toContain('FAIL_ME should be kept intact');
  });

  // CASE 8: AbortController 支持
  it('CASE 8: Aborting controller terminates work without corrupting results', async () => {
    const controller = new AbortController();
    controller.abort();

    const inputHtml = `<p>Immediate abort test.</p>`;
    const result = await planAndTranslateHtml(inputHtml, {
      targetLang: 'zh',
      signal: controller.signal,
    });

    expect(result).toBe(inputHtml);
    expect(mockTranslateFn).toHaveBeenCalledTimes(0);
  });

  // CASE 9: 避免二次翻译与幂等性
  it('CASE 9: Idempotency: does not double-translate or lose accuracy across repeated calls', async () => {
    const input = 'This is a clean email text.';
    const translatedOnce = await planAndTranslateText(input, {
      targetLang: 'zh',
    });
    const callCountAfterFirst = mockTranslateFn.mock.calls.length;

    const translatedTwice = await planAndTranslateText(input, {
      targetLang: 'zh',
    });
    expect(translatedTwice).toBe(translatedOnce);
    expect(mockTranslateFn.mock.calls.length).toBe(callCountAfterFirst);
  });

  // CASE 10: 不可翻译实体保护层全面验收 (Protected Non-Translatable Entities)
  it('CASE 10: Protects all specified high-certainty non-translatable entities without modification', async () => {
    const text = [
      'Please check email test@example.com and visit https://example.com/docs.',
      'Server IP is 192.168.1.1 or 2001:db8::1, running on domain api.service.io.',
      'Order ID: ORD-99281, SKU: SKU-8842, Tracking Number: 1Z9999999999999999, Serial Number: SN1002.',
      'Username: dev_admin and Account ID: ACC-9901.',
      'Check file /var/log/app.log and backup config.json.',
      'DNS Error: MX lookup of test.com returned NOERROR code 550 and status 5.1.1.',
      'We shipped 500 cartons weighing 1200 kg with total price 480 USD.',
      'UUID is 123e4567-e89b-12d3-a456-426614174000 and Message-ID is <msg123@mail.com>.',
    ].join(' ');

    const { protectedText, spanMap } = detectProtectedSpans(text);

    // Verify entities are replaced with ⟦P0⟧, ⟦P1⟧...
    expect(protectedText).toContain('⟦P0⟧');
    expect(protectedText).not.toContain('test@example.com');
    expect(protectedText).not.toContain('https://example.com/docs');

    // Simulate translation modifying English but keeping placeholders
    let mockTranslated = protectedText
      .replace('Please check email', '请检查邮箱')
      .replace('and visit', '并访问')
      .replace('Server IP is', '服务器 IP 是')
      .replace('Check file', '检查文件')
      .replace('DNS Error:', 'DNS 错误：')
      .replace('lookup of', '查询')
      .replace('returned', '返回')
      .replace('We shipped', '我们发运了')
      .replace('weighing', '重量为')
      .replace('with total price', '总价格为');

    const restored = restoreProtectedSpans(mockTranslated, text, spanMap);

    // Verify all original protected values are 100% restored
    expect(restored).toContain('test@example.com');
    expect(restored).toContain('https://example.com/docs');
    expect(restored).toContain('192.168.1.1');
    expect(restored).toContain('2001:db8::1');
    expect(restored).toContain('api.service.io');
    expect(restored).toContain('ORD-99281');
    expect(restored).toContain('SKU-8842');
    expect(restored).toContain('1Z9999999999999999');
    expect(restored).toContain('SN1002');
    expect(restored).toContain('dev_admin');
    expect(restored).toContain('ACC-9901');
    expect(restored).toContain('/var/log/app.log');
    expect(restored).toContain('config.json');
    expect(restored).toContain('MX');
    expect(restored).toContain('NOERROR');
    expect(restored).toContain('550');
    expect(restored).toContain('5.1.1');
    expect(restored).toContain('500 cartons');
    expect(restored).toContain('1200 kg');
    expect(restored).toContain('480 USD');
    expect(restored).toContain('123e4567-e89b-12d3-a456-426614174000');
    expect(restored).toContain('<msg123@mail.com>');
  });

  it('CASE 10b: Does not protect ordinary person-name initials as technical constants', () => {
    const { protectedText, spanMap } = detectProtectedSpans(
      'Gambino-Kreindl, Alessandro A.'
    );

    expect(protectedText).toBe('Gambino-Kreindl, Alessandro A.');
    expect(spanMap.size).toBe(0);
  });

  // CASE 11: 占位符校验失败时保留原文 (Validation & Fallback)
  it('CASE 11: Falls back to original text if placeholders are mangled or count mismatch occurs', () => {
    const original =
      'Visit https://example.com with token sk-abcdef1234567890123456';
    const { spanMap } = detectProtectedSpans(original);

    // Simulate translator dropping one placeholder
    const corruptedTranslation = '请访问 ⟦P0⟧，缺少了 token';
    const safeRestored = restoreProtectedSpans(
      corruptedTranslation,
      original,
      spanMap
    );

    // Must fall back to original text to prevent corrupting data
    expect(safeRestored).toBe(original);
  });

  // CASE 12: DOM structural invariant: tag hierarchy, attributes, and node structure remain 100% identical
  it('CASE 12: Preserves DOM structural invariant across complex HTML trees', async () => {
    const inputHtml = `
      <div id="wrapper" class="main-body" data-role="email">
        <h1 style="color: blue;">Account Notification</h1>
        <p class="intro">
          Please check your <a href="https://example.com/login" target="_blank" rel="noopener">credentials</a> carefully.
        </p>
        <table border="1" cellpadding="4">
          <thead>
            <tr><th>Feature</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Two-factor Auth</td>
              <td><span class="badge active">Enabled</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    const parser = new DOMParser();
    const docBefore = parser.parseFromString(inputHtml, 'text/html');
    const docAfter = parser.parseFromString(result, 'text/html');

    function assertStructuralEquality(nodeA: Element, nodeB: Element) {
      expect(nodeB.tagName).toBe(nodeA.tagName);
      expect(nodeB.attributes.length).toBe(nodeA.attributes.length);
      for (let i = 0; i < nodeA.attributes.length; i++) {
        const attrA = nodeA.attributes[i];
        expect(nodeB.getAttribute(attrA.name)).toBe(attrA.value);
      }
      expect(nodeB.children.length).toBe(nodeA.children.length);
      for (let i = 0; i < nodeA.children.length; i++) {
        assertStructuralEquality(nodeA.children[i], nodeB.children[i]);
      }
    }

    assertStructuralEquality(docBefore.body, docAfter.body);
    expect(result).toContain('[译]');
  });

  // CASE 13: Google Workspace table email fixture preserves label-value pairing and prevents column escaping
  it('CASE 13: Google Workspace table fixture keeps values in column 2 and protects entities', async () => {
    const inputHtml = `
      <table class="account-table">
        <tbody>
          <tr>
            <td>Domain</td>
            <td>chnprints.com</td>
          </tr>
          <tr>
            <td>Name</td>
            <td>ChnPrint Studio</td>
          </tr>
          <tr>
            <td>Account number</td>
            <td>1234-5678-9012</td>
          </tr>
          <tr>
            <td>Payment profile ID</td>
            <td>9876-5432-1098</td>
          </tr>
        </tbody>
      </table>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'text/html');
    const rows = doc.querySelectorAll('tr');

    // 1. Table structure preserved: exactly 4 rows, 2 cells each
    expect(rows.length).toBe(4);
    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      expect(cells.length).toBe(2);
    });

    // 2. Value cells (2nd column) are protected by isStructuralValueNode
    expect(rows[0].querySelectorAll('td')[1].textContent?.trim()).toBe(
      'chnprints.com'
    );
    expect(rows[1].querySelectorAll('td')[1].textContent?.trim()).toBe(
      'ChnPrint Studio'
    );
    expect(rows[2].querySelectorAll('td')[1].textContent?.trim()).toBe(
      '1234-5678-9012'
    );
    expect(rows[3].querySelectorAll('td')[1].textContent?.trim()).toBe(
      '9876-5432-1098'
    );

    // 3. Labels in 1st column are translated
    expect(rows[0].querySelectorAll('td')[0].textContent).toContain('[译]');
  });

  // CASE 14: Mixed-language per-segment translator routing
  it('CASE 14: Routes English and German to separate translators and skips Chinese', async () => {
    mockDetectFn.mockImplementation(async (text: string) => {
      if (/[\u4e00-\u9fa5]/.test(text)) {
        return [{ detectedLanguage: 'zh', confidence: 0.99 }];
      }
      if (text.includes('Guten Tag') || text.includes('Rechnung')) {
        return [{ detectedLanguage: 'de', confidence: 0.98 }];
      }
      return [{ detectedLanguage: 'en', confidence: 0.95 }];
    });

    const inputHtml = `
      <div>
        <p>Hello, your monthly subscription invoice is ready.</p>
        <p>Guten Tag, Ihre Rechnung steht zum Download bereit.</p>
        <p>您好，您的月度账单已经生成。</p>
      </div>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    // English translated via en->zh
    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'en',
      targetLanguage: 'zh',
    });

    // German translated via de->zh
    expect((globalThis as any).Translator.create).toHaveBeenCalledWith({
      sourceLanguage: 'de',
      targetLanguage: 'zh',
    });

    // Chinese does NOT invoke translator
    expect((globalThis as any).Translator.create).not.toHaveBeenCalledWith({
      sourceLanguage: 'zh',
      targetLanguage: 'zh',
    });

    // Chinese content remains 100% intact
    expect(result).toContain('您好，您的月度账单已经生成。');
    expect(result).not.toContain('[译] 您好');
  });

  // CASE 15: sourceLang cache isolation prevents collision between identically-spelled words across languages
  it('CASE 15: Isolates cache entries by sourceLanguage to prevent cross-language collisions', () => {
    setCachedText('Gift', 'en', 'zh', '礼物');
    setCachedText('Gift', 'de', 'zh', '毒物');

    expect(getCachedText('Gift', 'en', 'zh')).toBe('礼物');
    expect(getCachedText('Gift', 'de', 'zh')).toBe('毒物');
    expect(getCachedText('Gift', 'fr', 'zh')).toBeUndefined();
  });

  // CASE 16: Hard boundary isolation for table cells, list items, and paragraphs
  it('CASE 16: Strictly isolates text across TD, TH, LI, and P boundaries without cross-element merging', async () => {
    const inputHtml = `
      <table>
        <thead>
          <tr>
            <th>Header Alpha</th>
            <th>Header Beta</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>First Column Item</td>
            <td>Second Column Item</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>First Step Instruction</li>
        <li>Second Step Instruction</li>
      </ul>
      <p>Paragraph Alpha Content</p>
      <p>Paragraph Beta Content</p>
    `;

    const result = await planAndTranslateHtml(inputHtml, { targetLang: 'zh' });

    const parser = new DOMParser();
    const doc = parser.parseFromString(result, 'text/html');

    const ths = doc.querySelectorAll('th');
    expect(ths[0].textContent?.trim()).toBe('[译] Header Alpha');
    expect(ths[1].textContent?.trim()).toBe('[译] Header Beta');

    const tds = doc.querySelectorAll('td');
    expect(tds[0].textContent?.trim()).toBe('[译] First Column Item');
    expect(tds[1].textContent?.trim()).toBe('[译] Second Column Item');

    const lis = doc.querySelectorAll('li');
    expect(lis[0].textContent?.trim()).toBe('[译] First Step Instruction');
    expect(lis[1].textContent?.trim()).toBe('[译] Second Step Instruction');

    const ps = doc.querySelectorAll('p');
    expect(ps[0].textContent?.trim()).toBe('[译] Paragraph Alpha Content');
    expect(ps[1].textContent?.trim()).toBe('[译] Paragraph Beta Content');
  });
});
