import { Box, CircularProgress, Stack, Typography } from "@mui/material";

export default function LoadingScreen({
  appName = "BidForge",
  title = "Loading",
  subtitle = "Please wait...",
  fullscreen = true,
}) {
  return (
    <Box
      sx={{
        minHeight: fullscreen ? "100vh" : "60vh",
        display: "grid",
        placeItems: "center",
        px: 2,
      }}
    >
      <Stack
        spacing={1.2}
        alignItems="center"
        sx={{
          textAlign: "center",
          p: { xs: 3, md: 4 },
          borderRadius: 3,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          minWidth: { xs: "100%", sm: 360 },
          maxWidth: 460,
        }}
      >
        <Typography
          variant="h4"
          sx={{ color: "primary.main", fontFamily: "Space Grotesk, Inter, sans-serif" }}
        >
          {appName}
        </Typography>
        <CircularProgress size={28} />
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </Stack>
    </Box>
  );
}
