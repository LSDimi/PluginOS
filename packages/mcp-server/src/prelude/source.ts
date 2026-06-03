// The JS source injected into every execute_figma script. Runs in Figma's plugin sandbox.
// Helpers are filled in by subsequent tasks. This file is a single string template
// because the sandbox has no module system — everything must be inline.
export const PRELUDE_SOURCE = `// --- PluginOS prelude ---
;(function(){
  var P = {};
  P.version = '__PRELUDE_VERSION__';
  // Helpers added in subsequent tasks.
  globalThis.PluginOS = P;
})();
// --- end prelude ---
`;
