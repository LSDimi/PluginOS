const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");

module.exports = (env, argv) => [
  // Plugin code (sandbox)
  {
    entry: "./src/code.ts",
    output: {
      filename: "code.js",
      path: path.resolve(__dirname, "dist"),
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    mode: argv.mode || "production",
    target: "web",
  },
  // Plugin UI (iframe) — must be a single self-contained HTML file
  {
    entry: "./src/ui-entry.ts",
    output: {
      filename: "ui-bundle.js",
      path: path.resolve(__dirname, "dist"),
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/ui.html",
        filename: "ui.html",
        inject: "body",
      }),
      new HtmlInlineScriptPlugin(),
    ],
    mode: argv.mode || "production",
    target: "web",
  },
];
