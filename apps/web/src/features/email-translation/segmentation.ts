/**
 * DOM-aware Semantic Block Segmentation
 *
 * V2: Node-addressed architecture.
 * Each TextNode is independently tracked as a TranslationUnit.
 * SemanticBlock provides context (parent element, sibling info) but
 * never concatenates TextNodes into a single fullText for cross-node writeback.
 *
 * Hard boundaries: TD, TH, P, LI, H1-H6, BLOCKQUOTE, PRE, etc.
 * These elements are never merged across for translation.
 */

/**
 * Represents a single TextNode as an independent translation unit.
 * The text is translated and written back to this exact node only.
 */
export interface TranslationUnit {
  /** Reference to the original DOM TextNode */
  node: Text;
  /** Original text content of this TextNode (snapshot before translation) */
  originalText: string;
  /** The immediate parent element of this TextNode (for structural detection) */
  parentElement: Element | null;
  /** Unique identifier for this unit */
  unitId: string;
}

/**
 * A semantic block is a leaf-level block element containing one or more
 * TextNodes (TranslationUnits). It provides context for language detection
 * and structural entity detection, but each TextNode is translated independently.
 */
export interface SemanticBlock {
  blockId: string;
  element: Element;
  /** Individual TextNodes, each independently addressable */
  units: TranslationUnit[];
}

// ── Legacy compat: keep old interface available for textPlanner ──
export interface TextNodeMapping {
  node: Text;
  start: number;
  end: number;
  segmentId: string;
}

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'TD',
  'TH',
  'BLOCKQUOTE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
  'DD',
  'DT',
  'FIGCAPTION',
  'CAPTION',
  'SUMMARY',
]);

/**
 * Tags whose content must never be translated.
 * Aligned with Firefox Translations exclusion list.
 */
const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'BUTTON',
  'INPUT',
  'TEXTAREA',
  'CODE',
  'KBD',
  'SAMP',
  'VAR',
  'TEMPLATE',
]);

/**
 * Traverses DOM tree and finds the lowest (leaf-most) block elements that contain text.
 * Each TextNode inside a leaf block becomes an independent TranslationUnit.
 */
export function collectSemanticBlocks(root: Element): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];
  let blockCounter = 0;

  function hasChildBlock(el: Element): boolean {
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child && BLOCK_TAGS.has(child.tagName.toUpperCase())) {
        return true;
      }
    }
    return false;
  }

  function collectUnitsFromElement(
    el: Element,
    blockId: string
  ): TranslationUnit[] {
    const units: TranslationUnit[] = [];
    let unitCounter = 0;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (parent && EXCLUDED_TAGS.has(parent.tagName.toUpperCase())) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let textNode = walker.nextNode() as Text | null;
    while (textNode) {
      const val = textNode.nodeValue || '';
      if (val.trim()) {
        units.push({
          node: textNode,
          originalText: val,
          parentElement: textNode.parentElement,
          unitId: `${blockId}-unit-${unitCounter++}`,
        });
      }
      textNode = walker.nextNode() as Text | null;
    }

    return units;
  }

  function walk(el: Element) {
    const tag = el.tagName.toUpperCase();
    if (EXCLUDED_TAGS.has(tag)) return;

    if (BLOCK_TAGS.has(tag)) {
      // If this block element has child block elements, descend into children instead
      // to avoid processing both parent and child (hard boundary enforcement).
      if (hasChildBlock(el)) {
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          if (child) walk(child);
        }
        return;
      }

      // Leaf block element: extract all TextNodes as independent units
      const blockId = `block-${blockCounter++}`;
      const units = collectUnitsFromElement(el, blockId);

      if (units.length > 0) {
        blocks.push({
          blockId,
          element: el,
          units,
        });
      }
      return;
    }

    // Not a block tag (e.g. BODY, MAIN, ARTICLE, SECTION), traverse children
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i];
      if (child) walk(child);
    }
  }

  walk(root);

  // If no block tags were found (e.g. naked text in body or inline tags only),
  // treat the root itself as a single block.
  if (blocks.length === 0) {
    const blockId = 'root-block';
    const units = collectUnitsFromElement(root, blockId);

    if (units.length > 0) {
      blocks.push({
        blockId,
        element: root,
        units,
      });
    }
  }

  return blocks;
}
