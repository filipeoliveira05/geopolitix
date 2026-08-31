"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function resolveEffective(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Always writes a resolved light/dark value — never removes the attribute,
// even for "system" — because Tailwind's dark: variant (see globals.css's
// @custom-variant) only looks at this attribute, not prefers-color-scheme
// directly. Leaving it unset in "system" mode made every dark: utility
// (state map labels, party badges) stop responding to the OS theme even
// though the CSS-variable tokens (which DO still have their own
// prefers-color-scheme media query as a no-JS fallback) kept working —
// caught live via the map's state-abbreviation labels rendering with the
// wrong halo/text color in System mode on a dark OS.
function applyResolvedTheme(preference: ThemePreference) {
  document.documentElement.dataset.theme = resolveEffective(preference);
}

const listeners = new Set<() => void>();

function getSnapshot(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

// Matches the server's "system" render exactly — useSyncExternalStore
// resyncs to the real localStorage value on the client right after
// hydration with no mismatch warning, unlike a plain useState +
// useEffect(setState) which the lint rules here reject anyway.
function getServerSnapshot(): ThemePreference {
  return "system";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Mirrors the inline no-flash script in RootLayout's <head> (see there for
 * why the initial paint can't wait on React) — reads the same localStorage
 * key so the toggle button's displayed state matches what's already on
 * screen instead of always starting from "system".
 */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: ThemePreference) => {
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    applyResolvedTheme(next);
    listeners.forEach((listener) => listener());
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]);
  }, [theme, setTheme]);

  // While preference is "system", keeps the resolved data-theme attribute
  // live against an OS theme change (e.g. at sunset) — without this it
  // would stay stuck at whatever it last resolved to on mount/reload.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolvedTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  return { theme, setTheme, cycleTheme };
}
