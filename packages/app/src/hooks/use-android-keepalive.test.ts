// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAndroidKeepalive } from "./use-android-keepalive";

const { appState, listeners, platform, settings, startKeepalive, stopKeepalive, registerService } =
  vi.hoisted(() => {
    const state = {
      currentState: "active",
      addEventListener: vi.fn((_event: "change", listener: (nextState: string) => void) => {
        listenerSet.add(listener);
        return {
          remove: vi.fn(() => {
            listenerSet.delete(listener);
          }),
        };
      }),
    };
    const listenerSet = new Set<(nextState: string) => void>();

    return {
      appState: state,
      listeners: listenerSet,
      platform: { OS: "android" },
      settings: { androidBackgroundKeepalive: true },
      startKeepalive: vi.fn<() => Promise<void>>(async () => {}),
      stopKeepalive: vi.fn<() => Promise<void>>(async () => {}),
      registerService: vi.fn<() => void>(),
    };
  });

vi.mock("react-native", () => ({
  AppState: appState,
  Platform: platform,
}));

vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({
    settings,
  }),
}));

vi.mock("@/native/background-keepalive", () => ({
  startKeepalive,
  stopKeepalive,
}));

vi.mock("@/native/background-keepalive-service", () => ({
  registerBackgroundKeepaliveService: registerService,
}));

function emitAppState(nextState: string): void {
  appState.currentState = nextState;
  for (const listener of listeners) {
    listener(nextState);
  }
}

describe("useAndroidKeepalive", () => {
  beforeEach(() => {
    appState.currentState = "active";
    listeners.clear();
    platform.OS = "android";
    settings.androidBackgroundKeepalive = true;
    appState.addEventListener.mockClear();
    startKeepalive.mockClear();
    stopKeepalive.mockClear();
    registerService.mockClear();
  });

  it("registers the foreground service runner before starting keepalive", () => {
    const rendered = renderHook(() => useAndroidKeepalive());

    act(() => {
      emitAppState("background");
    });

    expect(registerService).toHaveBeenCalledTimes(1);
    expect(startKeepalive).toHaveBeenCalledTimes(1);
    expect(registerService.mock.invocationCallOrder[0]).toBeLessThan(
      startKeepalive.mock.invocationCallOrder[0],
    );

    rendered.unmount();
  });

  it("starts registered keepalive when mounted while already backgrounded", () => {
    appState.currentState = "background";

    const rendered = renderHook(() => useAndroidKeepalive());

    expect(registerService).toHaveBeenCalledTimes(1);
    expect(startKeepalive).toHaveBeenCalledTimes(1);

    rendered.unmount();
  });

  it("stops keepalive when the app returns active", () => {
    const rendered = renderHook(() => useAndroidKeepalive());

    act(() => {
      emitAppState("background");
      emitAppState("active");
    });

    expect(stopKeepalive).toHaveBeenCalledTimes(1);

    rendered.unmount();
  });

  it("does not register or start keepalive outside Android", () => {
    platform.OS = "ios";

    const rendered = renderHook(() => useAndroidKeepalive());

    act(() => {
      emitAppState("background");
    });

    expect(registerService).not.toHaveBeenCalled();
    expect(startKeepalive).not.toHaveBeenCalled();

    rendered.unmount();
  });
});
