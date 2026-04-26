import { alpha, createTheme } from "@mui/material/styles";

export function buildTheme(mode = "light") {
  const isDark = mode === "dark";
  const brandPrimary = isDark ? "#E6E6E6" : "#000000";
  const brandSecondary = isDark ? "#A6A6A6" : "#2B2B2B";
  const palette = {
    mode,
    primary: { main: brandPrimary },
    secondary: { main: brandSecondary },
    success: { main: isDark ? "#85F6B8" : "#29D87A" },
    warning: { main: isDark ? "#F7E76B" : "#C8A600" },
    error: { main: isDark ? "#FF7D88" : "#D14343" },
    info: { main: isDark ? "#8EE5FF" : "#C47B00" },
    text: {
      primary: isDark ? "#F5F5F5" : "#111111",
      secondary: isDark ? "#9E9E9E" : "#4A4A4A",
    },
    background: {
      default: isDark ? "#000000" : "#FFFFFF",
      paper: isDark ? "#050505" : "#FFFFFF",
    },
    divider: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.16)",
  };

  return createTheme({
    palette,
    shape: { borderRadius: 14 },
    spacing: 8,
    typography: {
      fontFamily: ["Inter", "Segoe UI", "Roboto", "Arial", "sans-serif"].join(","),
      h1: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 700, letterSpacing: -1 },
      h2: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 700, letterSpacing: -0.85 },
      h3: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 700, letterSpacing: -0.65 },
      h4: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 700, letterSpacing: -0.42 },
      h5: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 700, letterSpacing: -0.3 },
      h6: { fontFamily: ["Space Grotesk", "Inter", "sans-serif"].join(","), fontWeight: 600, letterSpacing: -0.2 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600, letterSpacing: 0.1 },
      button: { fontWeight: 600, letterSpacing: 0.2 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: "none",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${alpha(palette.primary.main, isDark ? 0.22 : 0.1)}`,
            boxShadow: isDark
              ? "0 0 0 rgba(0, 0, 0, 0)"
              : "0 8px 24px rgba(31, 41, 55, 0.08)",
            backgroundImage: "none",
            backdropFilter: "none",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: `1px solid ${alpha(palette.primary.main, isDark ? 0.18 : 0.08)}`,
            boxShadow: isDark
              ? "0 0 0 rgba(0, 0, 0, 0)"
              : "0 6px 20px rgba(15, 23, 42, 0.06)",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: 11,
            letterSpacing: 0.2,
            paddingInline: 14,
          },
          containedPrimary: {
            background: brandPrimary,
            color: isDark ? "#000000" : "#FFFFFF",
            "&:hover": {
              background: isDark ? "#FFFFFF" : "#1A1A1A",
            },
          },
          outlined: {
            borderColor: alpha(palette.primary.main, isDark ? 0.45 : 0.35),
            color: isDark ? "#F5F5F5" : undefined,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "outlined",
          size: "small",
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 11,
            backgroundColor: alpha(palette.background.paper, isDark ? 0.9 : 0.9),
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(brandPrimary, isDark ? 0.08 : 0.08),
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 700,
            color: palette.text.secondary,
            borderBottom: `1px solid ${alpha(brandPrimary, 0.22)}`,
          },
          body: {
            borderBottom: `1px solid ${alpha(brandPrimary, 0.12)}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: isDark ? "none" : "blur(12px)",
            backgroundColor: alpha(palette.background.paper, isDark ? 0.96 : 0.88),
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 42,
            borderBottom: `1px solid ${alpha(brandPrimary, 0.2)}`,
          },
          indicator: {
            height: 3,
            borderRadius: 999,
            background: brandSecondary,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 42,
            textTransform: "none",
            fontWeight: 600,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            border: `1px solid ${alpha(brandPrimary, isDark ? 0.2 : 0.14)}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${alpha(brandPrimary, isDark ? 0.2 : 0.25)}`,
            backgroundColor: alpha(palette.background.paper, isDark ? 0.98 : 0.96),
            backdropFilter: isDark ? "none" : "blur(10px)",
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            marginInline: 8,
            "&.Mui-selected": {
              backgroundColor: alpha(brandPrimary, isDark ? 0.16 : 0.13),
            },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${alpha(brandPrimary, 0.16)}`,
          },
        },
      },
      MuiTypography: {
        styleOverrides: {
          root: {
            textWrap: "pretty",
          },
        },
      },
    },
  });
}
