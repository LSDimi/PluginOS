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

  globalThis.PluginOS = P;
})();
// --- end prelude ---
`;
