// The JS source injected into every execute_figma script. Runs in Figma's plugin sandbox.
export const PRELUDE_SOURCE = `// --- PluginOS prelude ---
;(function(){
  var P = {};
  P.version = '__PRELUDE_VERSION__';

  P.createStyledText = async function(opts) {
    if (!opts.textStyleId && (!opts.family || opts.size == null)) {
      throw new Error('[PluginOS.createStyledText] requires textStyleId or (family + size)');
    }
    var weight = opts.weight || 'Regular';
    if (opts.family) {
      await figma.loadFontAsync({ family: opts.family, style: weight });
    }
    var node = figma.createText();
    if (opts.textStyleId) {
      await node.setTextStyleIdAsync(opts.textStyleId);
    } else {
      node.fontName = { family: opts.family, style: weight };
      node.fontSize = opts.size;
    }
    node.characters = opts.characters;
    if (opts.fillStyleId) {
      await node.setFillStyleIdAsync(opts.fillStyleId);
    }
    if (opts.name) node.name = opts.name;
    return node;
  };

  P.bindSpacing = async function(node, vars) {
    if (!node || !('layoutMode' in node) || node.layoutMode === 'NONE') return;
    function pick(specific, axis, all) {
      if (specific) return specific;
      if (axis) return axis;
      if (all) return all;
      return null;
    }
    var pairs = [
      ['paddingTop', pick(vars.paddingTop, vars.paddingY, vars.padding)],
      ['paddingBottom', pick(vars.paddingBottom, vars.paddingY, vars.padding)],
      ['paddingLeft', pick(vars.paddingLeft, vars.paddingX, vars.padding)],
      ['paddingRight', pick(vars.paddingRight, vars.paddingX, vars.padding)],
      ['itemSpacing', vars.itemSpacing || null],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var field = pairs[i][0];
      var v = pairs[i][1];
      if (v) node.setBoundVariable(field, v);
    }
  };

  P.combineAsVariantsTiled = function(cells, parent, opts) {
    opts = opts || {};
    var cols = opts.cols || Math.ceil(Math.sqrt(cells.length));
    var gutter = opts.gutter == null ? 16 : opts.gutter;
    var layoutMode = opts.layoutMode || 'HORIZONTAL';
    var wrap = opts.wrap !== false;
    var set = figma.combineAsVariants(cells, parent);
    set.layoutMode = layoutMode;
    if (wrap) set.layoutWrap = 'WRAP';
    set.itemSpacing = gutter;
    set.counterAxisSpacing = gutter;
    set.primaryAxisSizingMode = 'FIXED';
    set.counterAxisSizingMode = 'AUTO';
    var width = opts.width;
    if (width == null) {
      var cellW = cells[0] && cells[0].width ? cells[0].width : 0;
      width = cols * cellW + (cols - 1) * gutter + 32;
    }
    set.resize(width, set.height || 100);
    return set;
  };

  P.tileTopLevel = function(page, opts) {
    opts = opts || {};
    var cols = opts.cols || 4;
    var gutter = opts.gutter == null ? 64 : opts.gutter;
    var origin = opts.origin || { x: 0, y: 0 };
    var i = 0;
    var rowH = 0;
    var cursorX = origin.x;
    var cursorY = origin.y;
    return function place(node) {
      var col = i % cols;
      if (col === 0 && i > 0) {
        cursorY += rowH + gutter;
        cursorX = origin.x;
        rowH = 0;
      }
      node.x = cursorX;
      node.y = cursorY;
      page.appendChild(node);
      cursorX += node.width + gutter;
      if (node.height > rowH) rowH = node.height;
      i++;
    };
  };

  P.layoutSpaceBetween = function(frame, opts) {
    frame.primaryAxisAlignItems = 'MIN';
    var growChild = opts.growChild;
    if (!growChild && opts.children) {
      var kids = opts.children;
      if (kids.length >= 3) growChild = kids[Math.floor(kids.length / 2)];
      else if (kids.length === 2) growChild = kids[kids.length - 1];
    }
    if (!growChild) throw new Error('[PluginOS.layoutSpaceBetween] no growChild resolvable');
    if (growChild.type === 'TEXT') {
      growChild.layoutSizingHorizontal = 'FILL';
    } else {
      growChild.layoutGrow = 1;
    }
  };

  globalThis.PluginOS = P;
})();
// --- end prelude ---
`;
