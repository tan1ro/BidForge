import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Switch,
  Stack,
  TextField,
  FormControlLabel,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import { getProfile, getProfileSettings, updateProfile, updateProfileSettings } from "../api";
import { parseApiError } from "../utils/errorHandling";
import { formatDate, saveUserSettings } from "../utils/auctionFormatters";

export default function Profile() {
  const theme = useTheme();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({
    email_notifications: true,
    timezone: "Asia/Kolkata",
    default_rfq_page_size: 20,
    use_24h_time: false,
    date_format: "medium",
    auto_refresh_seconds: 10,
  });
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const [profileRes, settingsRes] = await Promise.all([getProfile(), getProfileSettings()]);
        setProfile(profileRes.data);
        setSettings({
          email_notifications: Boolean(settingsRes.data?.email_notifications ?? true),
          timezone: settingsRes.data?.timezone || "Asia/Kolkata",
          default_rfq_page_size: Number(settingsRes.data?.default_rfq_page_size ?? 20),
          use_24h_time: Boolean(settingsRes.data?.use_24h_time ?? false),
          date_format: settingsRes.data?.date_format || "medium",
          auto_refresh_seconds: Number(settingsRes.data?.auto_refresh_seconds ?? 10),
        });
        saveUserSettings(settingsRes.data || {});
      } catch (err) {
        setError(parseApiError(err, "Failed to load profile"));
      }
    }
    void loadProfile();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!profile) return <Typography>Loading profile...</Typography>;

  const roleColor = profile.role === "rfqowner" ? "primary" : "secondary";
  const roleLabel = profile.role === "rfqowner" ? "RFQ Owner" : "Bidder";
  const isDark = theme.palette.mode === "dark";
  const profileHeroText = isDark ? "#000000" : "#FFFFFF";
  const profileHeroAvatarBg = isDark ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.2)";
  const profileHeroChipBg = isDark ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.22)";

  async function handleSaveSettings() {
    setSaving(true);
    setSavedMessage("");
    setError("");
    try {
      const payload = {
        email_notifications: Boolean(settings.email_notifications),
        timezone: String(settings.timezone || "").trim(),
        default_rfq_page_size: Number(settings.default_rfq_page_size),
        use_24h_time: Boolean(settings.use_24h_time),
        date_format: String(settings.date_format || "medium"),
        auto_refresh_seconds: Number(settings.auto_refresh_seconds),
      };
      const res = await updateProfileSettings(payload);
      setSettings({
        email_notifications: Boolean(res.data?.email_notifications ?? true),
        timezone: res.data?.timezone || "Asia/Kolkata",
        default_rfq_page_size: Number(res.data?.default_rfq_page_size ?? 20),
        use_24h_time: Boolean(res.data?.use_24h_time ?? false),
        date_format: res.data?.date_format || "medium",
        auto_refresh_seconds: Number(res.data?.auto_refresh_seconds ?? 10),
      });
      saveUserSettings(res.data || {});
      setSavedMessage("Settings saved successfully.");
    } catch (err) {
      setError(parseApiError(err, "Failed to update settings"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    setSavedMessage("");
    setError("");
    try {
      const payload = {
        company_url: String(profile.company_url || "").trim(),
        about_company: String(profile.about_company || "").trim(),
      };
      const res = await updateProfile(payload);
      setProfile(res.data);
      setSavedMessage("Company profile updated successfully.");
    } catch (err) {
      setError(parseApiError(err, "Failed to update company profile"));
    } finally {
      setSavingProfile(false);
    }
  }

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
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <BusinessOutlinedIcon color="primary" />
                <Typography variant="h6">Company Profile</Typography>
              </Stack>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    label="Company URL"
                    placeholder="https://your-company.com"
                    value={profile.company_url || ""}
                    onChange={(e) => setProfile((prev) => ({ ...prev, company_url: e.target.value }))}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={4}
                    label="About Company"
                    placeholder="Brief description shown to bidders during auction bidding."
                    value={profile.about_company || ""}
                    onChange={(e) => setProfile((prev) => ({ ...prev, about_company: e.target.value }))}
                  />
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button variant="contained" onClick={handleSaveProfile} disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save company profile"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <PublicOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">Company URL</Typography>
              </Stack>
              <Typography variant="body1">{profile.company_url || "Not provided"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <BusinessOutlinedIcon color="primary" />
                <Typography variant="subtitle2" color="text.secondary">About Company</Typography>
              </Stack>
              <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                {profile.about_company || "Not provided"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <SettingsOutlinedIcon color="primary" />
                <Typography variant="h6">Settings</Typography>
              </Stack>
              {savedMessage && <Alert severity="success" sx={{ mb: 2 }}>{savedMessage}</Alert>}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.email_notifications}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, email_notifications: e.target.checked }))
                        }
                      />
                    }
                    label="Email notifications"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    select
                    fullWidth
                    label="Preferred timezone"
                    value={settings.timezone}
                    onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
                  >
                    <MenuItem value="Asia/Kolkata">Asia/Kolkata (IST)</MenuItem>
                    <MenuItem value="UTC">UTC</MenuItem>
                    <MenuItem value="Asia/Dubai">Asia/Dubai (GST)</MenuItem>
                    <MenuItem value="Europe/London">Europe/London (GMT/BST)</MenuItem>
                    <MenuItem value="America/New_York">America/New_York (ET)</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Default RFQ page size"
                    value={settings.default_rfq_page_size}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        default_rfq_page_size: Number(e.target.value),
                      }))
                    }
                    inputProps={{ min: 5, max: 100 }}
                    helperText="Allowed range: 5 to 100"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={settings.use_24h_time}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, use_24h_time: e.target.checked }))
                        }
                      />
                    }
                    label="Use 24-hour time"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    select
                    fullWidth
                    label="Date format"
                    value={settings.date_format}
                    onChange={(e) => setSettings((prev) => ({ ...prev, date_format: e.target.value }))}
                  >
                    <MenuItem value="short">Short</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="long">Long</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    type="number"
                    label="Auto refresh (seconds)"
                    value={settings.auto_refresh_seconds}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        auto_refresh_seconds: Number(e.target.value),
                      }))
                    }
                    inputProps={{ min: 5, max: 120 }}
                    helperText="Used in auction list auto-refresh"
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <Typography variant="body2" color="text.secondary">
                    Preview time in selected timezone: {formatDate(new Date().toISOString())}
                  </Typography>
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Button variant="contained" onClick={handleSaveSettings} disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
