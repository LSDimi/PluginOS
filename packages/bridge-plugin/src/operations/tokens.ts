import { registerOperation } from "./index";

// --- list_variables ---
registerOperation({
  manifest: {
    name: "list_variables",
    description:
      "List all local variables and variable collections in the file, grouped by collection.",
    category: "tokens",
    params: {
      type: {
        type: "string",
        required: false,
        description:
          "Filter by type: 'COLOR', 'FLOAT', 'STRING', 'BOOLEAN'",
      },
    },
    returns:
      "{ collections: Array<{name, id, modes, variableCount}>, total_variables, summary }",
  },
  async execute(params) {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const result: Array<{
      name: string;
      id: string;
      modes: string[];
      variableCount: number;
    }> = [];

    let totalVars = 0;

    for (const collection of collections) {
      let count = 0;
      for (const varId of collection.variableIds) {
        const variable =
          await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        if (params.type && variable.resolvedType !== params.type) continue;
        count++;
      }
      totalVars += count;
      result.push({
        name: collection.name,
        id: collection.id,
        modes: collection.modes.map((m) => m.name),
        variableCount: count,
      });
    }

    return {
      collections: result,
      total_variables: totalVars,
      summary: `${collections.length} collections, ${totalVars} variables.`,
    };
  },
});

// --- export_tokens ---
registerOperation({
  manifest: {
    name: "export_tokens",
    description:
      "Export all local variables as a structured JSON token map, compatible with Tokens Studio format.",
    category: "tokens",
    params: {},
    returns:
      "{ tokens: Record<collectionName, Record<modeName, Record<variableName, value>>> }",
  },
  async execute() {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const tokens: Record<
      string,
      Record<string, Record<string, unknown>>
    > = {};

    for (const collection of collections) {
      tokens[collection.name] = {};

      for (const mode of collection.modes) {
        tokens[collection.name][mode.name] = {};

        for (const varId of collection.variableIds) {
          const variable =
            await figma.variables.getVariableByIdAsync(varId);
          if (!variable) continue;

          const value = variable.valuesByMode[mode.modeId];
          let exportedValue: unknown = value;

          if (
            variable.resolvedType === "COLOR" &&
            typeof value === "object" &&
            value !== null &&
            "r" in value
          ) {
            const c = value as RGBA;
            const toHex = (n: number) =>
              Math.round(n * 255)
                .toString(16)
                .padStart(2, "0");
            exportedValue = `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
            if (c.a !== undefined && c.a < 1) {
              exportedValue += toHex(c.a);
            }
          }

          tokens[collection.name][mode.name][variable.name] =
            exportedValue;
        }
      }
    }

    return { tokens };
  },
});
