import { useEffect } from "react";
import { loadSettings, watchSettings } from "../storage";

/**
 * Apply the user's chosen theme to the document root so that the shared
 * `data-theme` CSS selectors and Tailwind `dark:` variants take effect.
 * Works in the popup, options page, and any other React surface.
 */
export function useTheme() {
  useEffect(() => {
    let unwatch: (() => void) | undefined;

    void (async () => {
      const settings = await loadSettings();
      document.documentElement.setAttribute(
        "data-theme",
        settings.selectionPopupTheme
      );

      unwatch = watchSettings((next) => {
        document.documentElement.setAttribute(
          "data-theme",
          next.selectionPopupTheme
        );
      });
    })();

    return () => unwatch?.();
  }, []);
}
