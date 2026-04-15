import { describe, it, expectTypeOf } from "vitest";
import type { IPluginBridge, BridgeStatus, FileInfo } from "../bridge.js";

describe("IPluginBridge types", () => {
  it("IPluginBridge has the required method signatures", () => {
    expectTypeOf<IPluginBridge["sendAndWait"]>().toBeFunction();
    expectTypeOf<IPluginBridge["getStatus"]>().returns.toEqualTypeOf<BridgeStatus>();
    expectTypeOf<IPluginBridge["listFiles"]>().returns.toEqualTypeOf<FileInfo[]>();
    expectTypeOf<IPluginBridge["isConnected"]>().returns.toEqualTypeOf<boolean>();
  });

  it("BridgeStatus has the expected shape", () => {
    expectTypeOf<BridgeStatus>().toHaveProperty("connected");
    expectTypeOf<BridgeStatus>().toHaveProperty("fileKey");
    expectTypeOf<BridgeStatus>().toHaveProperty("fileName");
    expectTypeOf<BridgeStatus>().toHaveProperty("currentPage");
    expectTypeOf<BridgeStatus>().toHaveProperty("port");
    expectTypeOf<BridgeStatus>().toHaveProperty("connectedFiles");
  });

  it("FileInfo has the expected shape", () => {
    expectTypeOf<FileInfo>().toHaveProperty("fileKey");
    expectTypeOf<FileInfo>().toHaveProperty("fileName");
    expectTypeOf<FileInfo>().toHaveProperty("currentPage");
  });
});
