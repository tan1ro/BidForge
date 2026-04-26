import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { login } from '../api';
import LoadingScreen from "../components/LoadingScreen";
import { parseApiError } from "../utils/errorHandling";

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await login(form);
      const { access_token: token, role, company_name } = res.data;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_role', role);
      localStorage.setItem('auth_company_name', company_name);
      onLogin({ role, companyName: company_name });
      navigate('/auctions', { replace: true });
    } catch (err) {
      setError(parseApiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <LoadingScreen
        title="Signing you in"
        subtitle="Verifying your credentials and loading dashboard data."
        fullscreen={false}
      />
    );
  }

  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        overflow: "hidden",
        minHeight: { xs: "calc(100vh - 72px)", md: "calc(100vh - 88px)" },
        display: "flex",
        alignItems: "center",
        px: { xs: 2, md: 4 },
        py: 0,
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
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 0, md: 5 }}
        sx={{ position: "relative", width: "100%", maxWidth: 1180, mx: "auto", alignItems: "center" }}
      >
        <Box sx={{ display: { xs: "none", md: "flex" }, flex: 1, pr: { md: 3 } }}>
          <Stack spacing={2}>
            <Typography
              variant="h3"
              sx={{
                color: "primary.main",
                fontFamily: "Space Grotesk, Inter, sans-serif",
                fontWeight: 800,
                letterSpacing: 0.4,
                lineHeight: 1.05,
                mb: 1,
                display: "inline-block",
                width: "8ch",
                overflow: "hidden",
                whiteSpace: "nowrap",
                borderRight: "2px solid currentColor",
                animation: "brandTyping 2s steps(8, end) infinite, brandCaret 0.8s step-end infinite",
                "@keyframes brandTyping": {
                  from: { width: "0ch" },
                  to: { width: "8ch" },
                },
                "@keyframes brandCaret": {
                  "0%, 49%": { borderRightColor: "currentColor" },
                  "50%, 100%": { borderRightColor: "transparent" },
                },
              }}
            >
              BidForge
            </Typography>
            <Typography variant="h4" sx={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}>
              Faster RFQ auctions for teams
            </Typography>
            <Typography color="text.secondary">
              Track bids in real time, automate vendor workflows, and keep every negotiation organized.
            </Typography>
            <Stack spacing={1}>
              <Typography color="text.primary">- Live RFQ and auction visibility</Typography>
              <Typography color="text.primary">- Smart supplier communication</Typography>
              <Typography color="text.primary">- Structured timelines and follow-ups</Typography>
            </Stack>
          </Stack>
        </Box>

        <Box sx={{ width: "100%", maxWidth: 500, ml: { md: "auto" } }}>
          <Card sx={{ width: "100%" }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack spacing={2.5}>
                <Box>

                  <Chip size="small" label="Back to your workspace" color="secondary" sx={{ mb: 1.2 }} />
                  <Typography variant="h5">Welcome back</Typography>
                  <Typography color="text.secondary" variant="body2">
                    Sign in to continue managing your auctions.
                  </Typography>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack spacing={2}>
                    <TextField
                      label="Company Name or Email"
                      value={form.company_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                      fullWidth
                      required
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      fullWidth
                      required
                    />
                    <Button type="submit" variant="contained" size="large" sx={{ mt: 0.5 }}>
                      Sign in
                    </Button>
                  </Stack>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  New here?{" "}
                  <Typography
                    component={RouterLink}
                    to="/signup"
                    sx={{
                      textDecoration: "none",
                      color: "text.primary",
                      fontWeight: 700,
                      "&:hover": {
                        textDecoration: "underline",
                        textDecorationColor: "text.primary",
                      },
                    }}
                  >
                    Create an account
                  </Typography>
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
}
