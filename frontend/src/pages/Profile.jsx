import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { getProfile } from "../api";
import { parseApiError } from "../utils/errorHandling";

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function Profile() {
  const theme = useTheme();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await getProfile();
        setProfile(res.data);
      } catch (err) {
        setError(parseApiError(err, "Failed to load profile"));
      }
    }
    void loadProfile();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!profile) return <Typography>Loading profile...</Typography>;

  const roleColor = profile.role === "buyer" ? "primary" : "secondary";
  const roleLabel = profile.role === "buyer" ? "Buyer" : "Supplier";
  const isDark = theme.palette.mode === "dark";
  const profileHeroText = isDark ? "#000000" : "#FFFFFF";
  const profileHeroAvatarBg = isDark ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.2)";
  const profileHeroChipBg = isDark ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.22)";

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">My Profile</Typography>
        <Typography color="text.secondary">Your account role and access level</Typography>
      </Box>

      <Card
        sx={{
          background: isDark
            ? `linear-gradient(120deg, ${alpha("#FFFFFF", 0.92)} 0%, ${alpha("#DADADA", 0.9)} 100%)`
            : `linear-gradient(120deg, ${alpha("#111111", 0.95)} 0%, ${alpha("#2A2A2A", 0.92)} 100%)`,
          color: profileHeroText,
          border: "none",
        }}
      >
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: profileHeroAvatarBg, color: profileHeroText }}>
              {(profile.company_name || "U").slice(0, 1).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h5">{profile.company_name}</Typography>
              <Chip
                size="small"
                color={roleColor}
                label={roleLabel}
                icon={<VerifiedUserOutlinedIcon />}
                sx={{ mt: 1, bgcolor: profileHeroChipBg, color: profileHeroText }}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <PersonOutlineOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">Company Name</Typography>
              </Stack>
              <Typography variant="h6">{profile.company_name}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <MailOutlineOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">Email</Typography>
              </Stack>
              <Typography variant="h6">{profile.email}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <VerifiedUserOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">Role</Typography>
              </Stack>
              <Typography variant="h6">{roleLabel}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <CalendarMonthOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">Member Since</Typography>
              </Stack>
              <Typography variant="h6">{formatDate(profile.created_at)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
