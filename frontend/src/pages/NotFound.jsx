import { Box, Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";

export default function NotFound() {
  return (
    <Box sx={{ minHeight: "65vh", display: "grid", placeItems: "center", px: 2 }}>
      <Stack spacing={1.5} sx={{ textAlign: "center", maxWidth: 420 }}>
        <Typography variant="h3">404</Typography>
        <Typography variant="h5">Page not found</Typography>
        <Typography color="text.secondary">
          The page you are trying to access does not exist or may have moved.
        </Typography>
        <Button component={RouterLink} to="/" variant="contained" sx={{ alignSelf: "center" }}>
          Go to dashboard
        </Button>
      </Stack>
    </Box>
  );
}
