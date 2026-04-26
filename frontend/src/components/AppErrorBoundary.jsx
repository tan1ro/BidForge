import { Component } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Unhandled UI error:", error);
  }

  handleGoToSafePage = () => {
    window.location.assign("/500");
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", px: 2 }}>
          <Stack spacing={1.5} sx={{ textAlign: "center", maxWidth: 460 }}>
            <Typography variant="h4">Something went wrong</Typography>
            <Typography color="text.secondary">
              An unexpected error occurred while rendering this page.
            </Typography>
            <Stack direction="row" spacing={1.2} justifyContent="center">
              <Button variant="contained" onClick={this.handleReload}>
                Reload app
              </Button>
              <Button variant="outlined" onClick={this.handleGoToSafePage}>
                Open error page
              </Button>
            </Stack>
          </Stack>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
