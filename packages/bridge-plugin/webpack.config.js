const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");

const { DXT_URL } = require("./src/constants.json");
const { version: MCP_VERSION } = require("../mcp-server/package.json");

const noModernSyntax = {
  arrowFunction: true,
  const: true,
  destructuring: true,
  forOf: true,
  optionalChaining: false,
};

module.exports = (env, argv) => [
  // Plugin code (sandbox)
  {
    entry: "./src/code.ts",
    output: {
      filename: "code.js",
      path: path.resolve(__dirname, "dist"),
      environment: noModernSyntax,
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    devtool: false,
    mode: argv.mode || "production",
    target: "web",
  },
  // Plugin UI (iframe) — full UI served by HTTP server for bootloader
  {
    entry: "./src/ui-entry.ts",
    output: {
      filename: "ui-bundle.js",
      path: path.resolve(__dirname, "dist"),
      environment: noModernSyntax,
    },
    module: {
      rules: [{ test: /\.ts$/, use: "ts-loader", exclude: /node_modules/ }],
    },
    resolve: { extensions: [".ts", ".js"] },
    devtool: false,
    plugins: [
      new webpack.DefinePlugin({
        __MCP_VERSION__: JSON.stringify(MCP_VERSION),
      }),
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
  // Bootloader — minimal HTML shell that fetches fresh UI from MCP server
  {
    entry: {},
    output: { path: path.resolve(__dirname, "dist") },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/bootloader.html",
        filename: "bootloader.html",
        inject: false,
        templateParameters: { DXT_URL, MCP_VERSION },
      }),
    ],
    mode: argv.mode || "production",
  },
];
