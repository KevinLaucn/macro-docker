/**
 * DOM-aware Semantic Block Segmentation
 * Identifies block-level containers (P, DIV, LI, TD, etc.) without parent/child double-counting.
 * Extracts text and retains precise TextNode offsets for safe write-back.
 */

export interface TextNodeMapping {
  node: Text;
  start: number;
  end: number;
  segmentId: string;
}

export interface SemanticBlock {
  blockId: string;
  element: Element;
  fullText: string;
  nodeMappings: TextNodeMapping[];
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

const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'SVG',
  'BUTTON',
  'INPUT',
  'TEXTAREA',
]);

/**
 * Traverses DOM tree and finds the lowest (leaf-most) block elements that contain text.
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

  function walk(el: Element) {
    const tag = el.tagName.toUpperCase();
    if (EXCLUDED_TAGS.has(tag)) return;

    if (BLOCK_TAGS.has(tag)) {
      // If this block element has child block elements, descend into children instead
      // to avoid processing both parent and child.
      if (hasChildBlock(el)) {
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          if (child) walk(child);
        }
        return;
      }

      // Leaf block element: extract all TextNodes inside it
      const blockId = `block-${blockCounter++}`;
      const mappings: TextNodeMapping[] = [];
      let fullText = '';
      let segmentCounter = 0;

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
        if (val) {
          const start = fullText.length;
          fullText += val;
          const end = fullText.length;
          mappings.push({
            node: textNode,
            start,
            end,
            segmentId: `${blockId}-seg-${segmentCounter++}`,
          });
        }
        textNode = walker.nextNode() as Text | null;
      }

      if (fullText.trim()) {
        blocks.push({
          blockId,
          element: el,
          fullText,
          nodeMappings: mappings,
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
    const mappings: TextNodeMapping[] = [];
    let fullText = '';
    let segCounter = 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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
      if (val) {
        const start = fullText.length;
        fullText += val;
        const end = fullText.length;
        mappings.push({
          node: textNode,
          start,
          end,
          segmentId: `root-seg-${segCounter++}`,
        });
      }
      textNode = walker.nextNode() as Text | null;
    }

    if (fullText.trim()) {
      blocks.push({
        blockId: 'root-block',
        element: root,
        fullText,
        nodeMappings: mappings,
      });
    }
  }

  return blocks;
}
