import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { signup } from "../api";
import { parseApiError } from "../utils/errorHandling";

function companyMatchesEmailDomain(companyName, email) {
  const normalizedCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const domain = email.includes("@") ? email.split("@")[1] : "";
  const domainRoot = domain.split(".")[0] || "";
  const normalizedDomain = domainRoot.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalizedCompany && normalizedDomain && normalizedCompany === normalizedDomain;
}

export default function Signup({ onSignup }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "bidder",
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Password and Confirm Password must match");
      return;
    }
    if (!companyMatchesEmailDomain(form.company_name, form.email)) {
      setError("Email domain must match company name (e.g. Acme -> name@acme.com)");
      return;
    }
    setLoading(true);
    try {
      const res = await signup(form);
      const { access_token: token, role, company_name } = res.data;
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_role", role);
      localStorage.setItem("auth_company_name", company_name);
      onSignup({ role, companyName: company_name });
      navigate("/auctions", { replace: true });
    } catch (err) {
      setError(parseApiError(err, "Signup failed"));
    } finally {
      setLoading(false);
    }
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
              <Typography color="text.primary">- Smart bidder communication</Typography>
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
                  <Typography variant="h5">Create an account</Typography>
                  <Typography color="text.secondary" variant="body2">
                    Start using the British Auction RFQ platform.
                  </Typography>
                </Box>
                {error && <Alert severity="error">{error}</Alert>}
                <Box component="form" onSubmit={handleSubmit}>
                  <Stack spacing={2}>
                    <TextField
                      label="Company Name"
                      value={form.company_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, company_name: e.target.value }))}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      required
                      fullWidth
                    />
                    <TextField
                      label="Confirm Password"
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      required
                      fullWidth
                    />
                    <TextField
                      select
                      label="Role"
                      value={form.role}
                      onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                      required
                    >
                      <MenuItem value="rfqowner">RFQ Owner</MenuItem>
                      <MenuItem value="bidder">Bidder</MenuItem>
                    </TextField>
                    <Button type="submit" variant="contained" size="large" disabled={loading}>
                      {loading ? <CircularProgress size={22} color="inherit" /> : "Create an account"}
                    </Button>
                  </Stack>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?{" "}
                  <Typography
                    component={RouterLink}
                    to="/login"
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
                    Sign in
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
