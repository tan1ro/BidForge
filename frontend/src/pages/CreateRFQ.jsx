import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { createRFQ } from '../api';
import { parseApiError } from "../utils/errorHandling";

const TRIGGER_OPTIONS = [
  { value: 'bid_received', label: 'Bid Received in Last X Minutes' },
  { value: 'rank_change', label: 'Any Supplier Rank Change in Last X Minutes' },
  { value: 'l1_change', label: 'Lowest Bidder (L1) Rank Change in Last X Minutes' },
];
const DATE_FIELDS = ["bid_start_time", "bid_close_time", "forced_close_time", "pickup_date"];
const TECHNICAL_SPEC_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function toLocalDateTimeInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    0,
    0
  );
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d) ||
    date.getHours() !== Number(hh) ||
    date.getMinutes() !== Number(mm)
  ) {
    return null;
  }
  return date;
}

function getMinDateTime(value, minutesAfter = 1) {
  const date = parseLocalDateTime(value);
  if (!date) return undefined;
  date.setMinutes(date.getMinutes() + minutesAfter);
  return toLocalDateTimeInputValue(date);
}

function normalizeNumber(name, value) {
  if (value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const safe = Math.trunc(n);
  if (name === "trigger_window_minutes") return Math.max(1, Math.min(60, safe));
  return Math.max(1, Math.min(30, safe));
}

function rebuildDateChain(nextForm) {
  const next = { ...nextForm };
  const start = parseLocalDateTime(next.bid_start_time);
  const close = parseLocalDateTime(next.bid_close_time);
  const forced = parseLocalDateTime(next.forced_close_time);
  const pickup = parseLocalDateTime(next.pickup_date);

  if (start && close && close <= start) next.bid_close_time = "";
  if (start && pickup && pickup <= start) next.pickup_date = "";

  const closeAfterReset = parseLocalDateTime(next.bid_close_time);
  if (closeAfterReset && forced && forced <= closeAfterReset) next.forced_close_time = "";
  return next;
}

function validateForm(form) {
  if (!form.name.trim()) return "RFQ name is required";
  if (!form.material.trim()) return "Material is required";
  if (!form.quantity.trim()) return "Quantity is required";
  if (!form.pickup_location.trim()) return "Pickup location is required";
  if (!form.delivery_location.trim()) return "Delivery location is required";
  for (const field of DATE_FIELDS) {
    if (!form[field]) return "All date and time fields are required";
  }

  const start = parseLocalDateTime(form.bid_start_time);
  const close = parseLocalDateTime(form.bid_close_time);
  const forced = parseLocalDateTime(form.forced_close_time);
  const pickup = parseLocalDateTime(form.pickup_date);

  if (!start || !close || !forced || !pickup) return "Please enter valid date and time values";
  if (start >= close) return "Bid close must be after bid start";
  if (close >= forced) return "Forced close must be after bid close";
  if (pickup <= start) return "Pickup / Service date must be after bid start";

  const triggerWindow = Number(form.trigger_window_minutes);
  const extensionDuration = Number(form.extension_duration_minutes);
  const startingPrice = Number(form.starting_price);
  const minimumDecrement = Number(form.minimum_decrement);
  if (!Number.isInteger(triggerWindow) || triggerWindow < 1 || triggerWindow > 60) {
    return "Trigger Window must be an integer from 1 to 60";
  }
  if (!Number.isInteger(extensionDuration) || extensionDuration < 1 || extensionDuration > 30) {
    return "Extension Duration must be an integer from 1 to 30";
  }
  if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
    return "Starting Price must be greater than zero";
  }
  if (!Number.isFinite(minimumDecrement) || minimumDecrement < 0) {
    return "Minimum Decrement must be zero or greater";
  }
  if (minimumDecrement >= startingPrice) {
    return "Minimum Decrement must be lower than Starting Price to keep bidding possible";
  }
  return "";
}

const dateTimeFieldSx = (theme) => ({
  "& input[type='datetime-local']": {
    colorScheme: theme.palette.mode,
  },
  "& input[type='datetime-local']::-webkit-calendar-picker-indicator": {
    cursor: "pointer",
    borderRadius: 4,
    padding: 2,
    opacity: 1,
    filter: theme.palette.mode === "dark" ? "invert(1) brightness(2.2) contrast(1.2)" : "brightness(0) contrast(1.2)",
    WebkitFilter: theme.palette.mode === "dark" ? "invert(1) brightness(2.2) contrast(1.2)" : "brightness(0) contrast(1.2)",
    backgroundColor: theme.palette.mode === "dark" ? alpha(theme.palette.common.white, 0.08) : alpha(theme.palette.common.black, 0.06),
  },
});

function DateTimeField({ name, label, value, onChange, min, helperText }) {
  return (
    <TextField
      fullWidth
      type="datetime-local"
      name={name}
      label={label}
      value={value}
      onChange={onChange}
      InputLabelProps={{ shrink: true }}
      inputProps={{ min, step: 60 }}
      sx={dateTimeFieldSx}
      required
      helperText={helperText}
    />
  );
}

export default function CreateRFQ() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timezoneHint] = useState(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
    // Normalize deprecated alias shown by some browsers.
    return tz === "Asia/Calcutta" ? "Asia/Kolkata" : tz;
  });

  const [form, setForm] = useState({
    name: '',
    material: '',
    quantity: '',
    pickup_location: '',
    delivery_location: '',
    bid_start_time: '',
    bid_close_time: '',
    forced_close_time: '',
    pickup_date: '',
    trigger_window_minutes: 10,
    extension_duration_minutes: 5,
    extension_trigger: 'bid_received',
    auction_type: 'Reverse Auction (lowest wins)',
    starting_price: '',
    minimum_decrement: '',
    technical_specs_attachment: '',
    technical_specs_file_name: '',
    technical_specs_content_type: '',
    technical_specs_file_base64: '',
    loading_unloading_notes: '',
  });

  async function handleTechnicalSpecUpload(file) {
    if (!file) {
      setForm((prev) => ({
        ...prev,
        technical_specs_file_name: "",
        technical_specs_content_type: "",
        technical_specs_file_base64: "",
      }));
      return;
    }
    if (file.size > TECHNICAL_SPEC_MAX_FILE_SIZE_BYTES) {
      setError("Technical specs file must be 5MB or smaller");
      return;
    }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const encoded = result.includes(",") ? result.split(",")[1] : "";
        resolve(encoded);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    setForm((prev) => ({
      ...prev,
      technical_specs_file_name: file.name,
      technical_specs_content_type: file.type || "application/octet-stream",
      technical_specs_file_base64: String(base64),
      technical_specs_attachment: file.name,
    }));
    setError("");
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const nextDraft = {
        ...prev,
        [name]:
          name === "trigger_window_minutes" || name === "extension_duration_minutes"
            ? normalizeNumber(name, value)
            : value,
      };
      const next = rebuildDateChain(nextDraft);
      setError(validateForm(next));
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');

    setLoading(true);
    try {
      const bidStartDate = parseLocalDateTime(form.bid_start_time);
      const bidCloseDate = parseLocalDateTime(form.bid_close_time);
      const forcedCloseDate = parseLocalDateTime(form.forced_close_time);
      const pickupDate = parseLocalDateTime(form.pickup_date);
      const payload = {
        ...form,
        bid_start_time: bidStartDate.toISOString(),
        bid_close_time: bidCloseDate.toISOString(),
        forced_close_time: forcedCloseDate.toISOString(),
        pickup_date: pickupDate.toISOString(),
        trigger_window_minutes: Number(form.trigger_window_minutes),
        extension_duration_minutes: Number(form.extension_duration_minutes),
        starting_price: Number(form.starting_price),
        minimum_decrement: Number(form.minimum_decrement),
      };

      const res = await createRFQ(payload);
      navigate(`/auction/${res.data.id}`, {
        state: {
          createdReferenceId: res.data.reference_id,
          createdAtLabel: new Date().toLocaleString("en-IN"),
        },
      });
    } catch (err) {
      setError(parseApiError(err, "Failed to create RFQ"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">Create British Auction RFQ</Typography>
        <Typography color="text.secondary">Configure British Auction window and extension rules</Typography>
      </Box>

      <Card sx={{ maxWidth: 980 }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <Chip
                icon={<SettingsSuggestOutlinedIcon fontSize="small" />}
                label="Auction Configuration"
                color="primary"
                sx={{ width: "fit-content" }}
              />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12 }}>
                  <TextField fullWidth name="name" label="RFQ Name / Reference Title" value={form.name} onChange={handleChange} required />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth name="material" label="Material" value={form.material} onChange={handleChange} required helperText="Example: Industrial Pallet Racks (Steel)" />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth name="quantity" label="Quantity" value={form.quantity} onChange={handleChange} required helperText="Example: 12 Tons / 2 Full Truck Loads" />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth name="pickup_location" label="Pickup Location (Origin)" value={form.pickup_location} onChange={handleChange} required />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth name="delivery_location" label="Delivery Location (Destination)" value={form.delivery_location} onChange={handleChange} required />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <DateTimeField
                    name="bid_start_time"
                    label="Bid Start Date & Time"
                    value={form.bid_start_time}
                    onChange={handleChange}
                    helperText={`Captured in ${timezoneHint}, submitted as UTC`}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <DateTimeField
                    name="bid_close_time"
                    label="Bid Close Date & Time"
                    value={form.bid_close_time}
                    onChange={handleChange}
                    min={getMinDateTime(form.bid_start_time)}
                    helperText="Must be after Bid Start"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <DateTimeField
                    name="forced_close_time"
                    label="Forced Bid Close Date & Time"
                    value={form.forced_close_time}
                    onChange={handleChange}
                    min={getMinDateTime(form.bid_close_time)}
                    helperText="Must be after Bid Close"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <DateTimeField
                    name="pickup_date"
                    label="Pickup / Service Date & Time"
                    value={form.pickup_date}
                    onChange={handleChange}
                    min={getMinDateTime(form.bid_start_time)}
                    helperText="Must be after Bid Start"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth type="number" name="trigger_window_minutes" label="Trigger Window (minutes)" value={form.trigger_window_minutes} onChange={handleChange} inputProps={{ min: 1, max: 60 }} required />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth type="number" name="extension_duration_minutes" label="Extension Duration (minutes)" value={form.extension_duration_minutes} onChange={handleChange} inputProps={{ min: 1, max: 30 }} required />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    select
                    fullWidth
                    name="extension_trigger"
                    label="Extension Trigger"
                    value={form.extension_trigger}
                    onChange={handleChange}
                    helperText="Bid received: any bid. Rank change: any supplier rank move. L1 change: only lowest bidder change."
                  >
                    {TRIGGER_OPTIONS.map((opt) => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField
                    fullWidth
                    name="auction_type"
                    label="Auction Type"
                    value={form.auction_type}
                    onChange={handleChange}
                    disabled
                    helperText="Reverse Auction (lowest wins)"
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField fullWidth type="number" name="starting_price" label="Starting Price (INR)" value={form.starting_price} onChange={handleChange} inputProps={{ min: 0, step: "0.01" }} required />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField fullWidth type="number" name="minimum_decrement" label="Minimum Decrement (INR)" value={form.minimum_decrement} onChange={handleChange} inputProps={{ min: 0, step: "0.01" }} required />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Stack spacing={1}>
                    <TextField fullWidth name="technical_specs_attachment" label="Technical Specs Attachment (link or filename)" value={form.technical_specs_attachment} onChange={handleChange} helperText="Paste URL/path or upload a file below" />
                    <Button component="label" variant="outlined">
                      Upload technical specs file
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          void handleTechnicalSpecUpload(file);
                        }}
                      />
                    </Button>
                    {form.technical_specs_file_name && (
                      <Typography variant="caption" color="text.secondary">
                        Uploaded: {form.technical_specs_file_name}
                      </Typography>
                    )}
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    name="loading_unloading_notes"
                    label="Loading/Unloading Instructions"
                    value={form.loading_unloading_notes}
                    onChange={handleChange}
                    multiline
                    minRows={2}
                  />
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                <Button variant="outlined" onClick={() => navigate('/')}>Cancel</Button>
                <Button type="submit" variant="contained" startIcon={<SaveOutlinedIcon />} disabled={loading}>
                  {loading ? 'Creating...' : 'Create RFQ'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
