import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import bidForgeLogo from "../assets/bidforge-logo.svg";

export default function Home() {
  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        overflow: "hidden",
        minHeight: "calc(100vh - 72px)",
        display: "flex",
        alignItems: "center",
        py: { xs: 3, md: 4 },
        px: { xs: 2, md: 4 },
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: {
            xs: "none",
            md:
              theme.palette.mode === "dark"
                ? "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)"
                : "linear-gradient(rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)",
          },
          backgroundSize: { md: "40px 40px" },
          pointerEvents: "none",
        },
      })}
    >
      <Container maxWidth="lg" sx={{ position: "relative" }}>
        <Card sx={{ maxWidth: 980, mx: "auto" }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 3, md: 5 }} alignItems={{ md: "center" }}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box component="img" src={bidForgeLogo} alt="BidForge logo" sx={{ width: 38, height: 38, borderRadius: 1 }} />
                  <Chip size="small" label="British Auction RFQ Platform" color="secondary" />
                </Stack>
                <Typography variant="h4" sx={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}>
                  Welcome to BidForge
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1.25, maxWidth: 600 }}>
                  Run British Auction RFQs with live bids, role-based workflows, and clear auction timelines.
                </Typography>
                <Stack spacing={0.6} sx={{ mt: 2 }}>
                  <Typography color="text.secondary">- Buyer and supplier authentication</Typography>
                  <Typography color="text.secondary">- Real-time RFQ bidding</Typography>
                  <Typography color="text.secondary">- Auction analytics dashboard</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2.2 }}>
                  This app was developed by NandeeshK
                </Typography>
              </Box>
              <Stack spacing={1.2} sx={{ width: "100%", maxWidth: 240, ml: { md: "auto" } }}>
                <Button component={RouterLink} to="/login" size="large" variant="contained" fullWidth>
                  Login
                </Button>
                <Button component={RouterLink} to="/signup" size="large" variant="outlined" fullWidth>
                  Signup
                </Button>
                <Button href="https://nandeesh-kantli.vercel.app/" target="_blank" rel="noreferrer" fullWidth>
                  View Portfolio
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
        <Stack sx={{ mt: 1.5 }} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Designed to match the clean BidForge login experience
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}
