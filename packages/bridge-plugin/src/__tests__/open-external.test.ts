import { describe, it, expect, vi } from "vitest";
import { handleOpenExternal } from "../handlers/open-external";

describe("handleOpenExternal", () => {
  it("calls figma.openExternal with the url when type is 'open-external' and url is a string", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal(
      { type: "open-external", url: "https://example.com/pluginos.dxt" },
      figmaRef
    );
    expect(dispatched).toBe(true);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith("https://example.com/pluginos.dxt");
  });

  it("does NOT call figma.openExternal when url is missing", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal({ type: "open-external" }, figmaRef);
    expect(dispatched).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does NOT call figma.openExternal when url is not a string", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal({ type: "open-external", url: 42 }, figmaRef);
    expect(dispatched).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does NOT call figma.openExternal when url is an empty string", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal({ type: "open-external", url: "" }, figmaRef);
    expect(dispatched).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("does NOT call figma.openExternal when url is null", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal({ type: "open-external", url: null }, figmaRef);
    expect(dispatched).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it("returns false for unrelated message types", () => {
    const openExternal = vi.fn();
    const figmaRef = { openExternal } as unknown as PluginAPI;
    const dispatched = handleOpenExternal({ type: "ws-message", payload: {} }, figmaRef);
    expect(dispatched).toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });
});
