import { Box, Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

export default function NotFound() {
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={1.6} sx={{ textAlign: "center", maxWidth: 520 }}>
        <Typography variant="h3" sx={{ fontWeight: 700 }}>
          404
        </Typography>
        <Typography variant="h5">This page does not exist</Typography>
        <Typography color="text.secondary">
          The link may be broken, the page may have moved, or the URL may be incorrect.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="center">
          <Button component={RouterLink} to="/" variant="contained">
            Go home
          </Button>
          {canGoBack && (
            <Button variant="outlined" onClick={() => window.history.back()}>
              Go back
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
