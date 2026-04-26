import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import bidForgeLogo from "../assets/bidforge-logo.svg";

export default function Home() {
  const features = [
    {
      icon: <GavelOutlinedIcon color="primary" fontSize="small" />,
      title: "Live Auction Control",
      description: "Run real-time RFQ bidding with clear rank visibility for faster negotiations.",
    },
    {
      icon: <SecurityOutlinedIcon color="primary" fontSize="small" />,
      title: "Secure Role Access",
      description: "Protect RFQ Owner and Bidder actions with role-based access and authenticated workflows.",
    },
    {
      icon: <TimelineOutlinedIcon color="primary" fontSize="small" />,
      title: "Timeline Intelligence",
      description: "Apply extension rules and auction windows with predictable event timelines.",
    },
    {
      icon: <InsightsOutlinedIcon color="primary" fontSize="small" />,
      title: "Decision Analytics",
      description: "Use bid behavior insights and auction metrics to make stronger procurement decisions.",
    },
  ];

  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        overflow: "hidden",
        minHeight: "calc(100vh - 72px)",
        py: { xs: 5, md: 8 },
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
      <Container
        maxWidth={false}
        sx={{
          position: "relative",
          px: { xs: 2.5, sm: 4, md: 8, lg: 12, xl: 18 },
        }}
      >
        <Stack spacing={{ xs: 5, md: 7 }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 4, lg: 8 }} alignItems={{ lg: "center" }}>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1.5 }}>
                <Box component="img" src={bidForgeLogo} alt="BidForge logo" sx={{ width: 42, height: 42, borderRadius: 1 }} />
                <Chip label="British Auction RFQ Platform" size="small" color="secondary" />
              </Stack>
              <Typography variant="h2" sx={{ fontSize: { xs: "2rem", md: "3rem" }, lineHeight: 1.1, maxWidth: 760 }}>
                Run procurement auctions faster with BidForge
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1.8, maxWidth: 700 }}>
                Launch RFQs, receive bidder bids in real time, and close every auction with transparent rules and
                decision-ready data.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
                <Button component={RouterLink} to="/login" size="large" variant="contained">
                  Login
                </Button>
                <Button component={RouterLink} to="/signup" size="large" variant="outlined">
                  Signup
                </Button>
                <Button component={RouterLink} to="/about" size="large" variant="text">
                  About the project
                </Button>
              </Stack>
            </Box>
            <Box
              sx={{
                flex: 1,
                width: "100%",
                p: { xs: 2.5, md: 3.5 },
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.6 }}>
                <AutoAwesomeOutlinedIcon color="secondary" fontSize="small" />
                <Typography variant="h6">Core Capabilities</Typography>
              </Stack>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Designed with a modern landing-page style similar to top AI product sites: clear value, trust signals,
                and feature clarity.
              </Typography>
              <Stack spacing={1.6}>
                {features.map((item) => (
                  <Stack key={item.title} direction="row" spacing={1.2} alignItems="flex-start">
                    <Box sx={{ mt: 0.25 }}>{item.icon}</Box>
                    <Box>
                      <Typography variant="subtitle2">{item.title}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.description}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>

        </Stack>
      </Container>
    </Box>
  );
}
