import { useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider } from "@mui/material";
import App from "../App";
import { buildTheme } from "../theme";
import LoadingScreen from "./LoadingScreen";

export default function ThemeController() {
  const savedMode = localStorage.getItem("ui_theme_mode");
  const initialMode = savedMode === "dark" || savedMode === "light" ? savedMode : "light";
  const [mode, setMode] = useState(initialMode);
  const [showFirstLoad, setShowFirstLoad] = useState(() => !localStorage.getItem("seen_intro_loader"));
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    if (!showFirstLoad) return;
    const timer = setTimeout(() => {
      localStorage.setItem("seen_intro_loader", "1");
      setShowFirstLoad(false);
    }, 1400);
    return () => clearTimeout(timer);
  }, [showFirstLoad]);

  function toggleTheme() {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("ui_theme_mode", next);
      return next;
    });
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {showFirstLoad ? (
        <LoadingScreen
          title="Preparing your workspace"
          subtitle="Setting up auctions, profile, and activity feeds."
        />
      ) : (
        <App themeMode={mode} onToggleTheme={toggleTheme} />
      )}
    </ThemeProvider>
  );
}
