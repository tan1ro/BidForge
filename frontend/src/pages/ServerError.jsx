import { Box, Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

export default function ServerError() {
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;

  return (
    <Box sx={{ minHeight: "70vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={1.5} sx={{ textAlign: "center", maxWidth: 460 }}>
        <Typography variant="h3">500</Typography>
        <Typography variant="h5">Server error</Typography>
        <Typography color="text.secondary">
          We could not complete your request due to an internal server issue.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="center">
          <Button onClick={() => window.location.reload()} variant="contained">
            Try again
          </Button>
          <Button component={RouterLink} to="/" variant="outlined">
            Go home
          </Button>
          {canGoBack && (
            <Button variant="text" onClick={() => window.history.back()}>
              Go back
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
