import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SettingsSuggestOutlinedIcon from "@mui/icons-material/SettingsSuggestOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import { createRFQ } from '../api';
import { parseApiError } from "../utils/errorHandling";
import { openFileLink, getPreferredTimezoneLabel, formatDate } from "../utils/auctionFormatters";

const TRIGGER_OPTIONS = [
  { value: 'bid_received', label: 'Bid Received in Last X Minutes' },
  { value: 'rank_change', label: 'Any Bidder Rank Change in Last X Minutes' },
  { value: 'l1_change', label: 'Lowest Bidder (L1) Rank Change in Last X Minutes' },
];
const BIDDER_VISIBILITY_OPTIONS = [
  { value: "full_rank", label: "Full rank visibility" },
  { value: "masked_competitor", label: "Masked competitors" },
];
const DATE_FIELDS = ["bid_start_time", "bid_close_time", "forced_close_time", "pickup_date"];
const TECHNICAL_SPEC_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TECHNICAL_SPEC_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt"];

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
  for (const field of DATE_FIELDS) {
    if (!form[field]) return "All date and time fields are required";
  }

  const start = parseLocalDateTime(form.bid_start_time);
  const close = parseLocalDateTime(form.bid_close_time);
  const forced = parseLocalDateTime(form.forced_close_time);
  const pickup = parseLocalDateTime(form.pickup_date);
  const now = new Date();

  if (!start || !close || !forced || !pickup) return "Please enter valid date and time values";
  if (start < now) return "Bid start date/time cannot be before current date/time";
  if (forced < now) return "Forced bid close date/time cannot be before current date/time";
  if (pickup < now) return "Pickup / service date/time cannot be before current date/time";
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
  const gapMinutes = Math.floor((forced.getTime() - close.getTime()) / (1000 * 60));
  if (extensionDuration > gapMinutes) {
    return "Extension Duration cannot exceed the time between Bid Close and Forced Close";
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
    const tz = getPreferredTimezoneLabel();
    // Normalize deprecated alias shown by some browsers.
    return tz === "Asia/Calcutta" ? "Asia/Kolkata" : tz;
  });
  const [baseMinDateTime] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const uploadedFilesRef = useRef([]);

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
    bidder_visibility_mode: "full_rank",
    starting_price: '',
    minimum_decrement: '',
    technical_specs_attachment: '',
    technical_specs_url: '',
    technical_specs_file_name: '',
    technical_specs_content_type: '',
    technical_specs_file_size_bytes: 0,
    loading_unloading_notes: '',
  });

  function applyTechnicalSpecsToForm(files) {
    const first = files[0];
    if (!first) {
      setForm((prev) => ({
        ...prev,
        technical_specs_attachment: "",
        technical_specs_url: "",
        technical_specs_file_name: "",
        technical_specs_content_type: "",
        technical_specs_file_size_bytes: 0,
      }));
      return;
    }
    const attachmentText =
      files.length === 1
        ? "Uploaded technical specification document"
        : `Uploaded ${files.length} technical specification documents`;
    setForm((prev) => ({
      ...prev,
      technical_specs_attachment: attachmentText,
      technical_specs_url: first.url,
      technical_specs_file_name: first.name,
      technical_specs_content_type: first.contentType,
      technical_specs_file_size_bytes: first.size,
    }));
  }

  async function handleTechnicalSpecUpload(fileList) {
    const filesToAdd = Array.from(fileList || []);
    if (!filesToAdd.length) return;
    const next = [...uploadedFiles];
    for (const file of filesToAdd) {
      const lowerName = file.name.toLowerCase();
      const isAllowedType = ALLOWED_TECHNICAL_SPEC_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!isAllowedType) {
        setError(`"${file.name}" is not supported. Upload only PDF, DOC, DOCX, XLS, XLSX, or TXT`);
        continue;
      }
      if (file.size > TECHNICAL_SPEC_MAX_FILE_SIZE_BYTES) {
        setError(`"${file.name}" exceeds 5MB limit`);
        continue;
      }
      const localFileUrl = URL.createObjectURL(file);
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
        url: localFileUrl,
      });
    }
    setUploadedFiles(next);
    applyTechnicalSpecsToForm(next);
    setError("");
  }

  function removeTechnicalSpec(fileId) {
    const next = uploadedFiles.filter((f) => f.id !== fileId);
    const removed = uploadedFiles.find((f) => f.id === fileId);
    if (removed?.url) {
      URL.revokeObjectURL(removed.url);
    }
    setUploadedFiles(next);
    if (previewFile?.id === fileId) {
      setPreviewFile(null);
    }
    applyTechnicalSpecsToForm(next);
    setError("");
  }

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    return () => {
      for (const file of uploadedFilesRef.current) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
    };
  }, []);

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
          createdAtLabel: formatDate(new Date().toISOString()),
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
        <Typography color="text.secondary">Configure auction timeline, extension logic, and commercial terms</Typography>
      </Box>

      <Card sx={{ width: "100%" }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Box component="form" onSubmit={handleSubmit} autoComplete="off">
            <Stack spacing={2.5}>
              {error && <Alert severity="error">{error}</Alert>}
              <Chip
                icon={<SettingsSuggestOutlinedIcon fontSize="small" />}
                label="Auction Configuration"
                color="primary"
                sx={{ width: "fit-content" }}
              />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Basic Details
                      </Typography>
                      <Divider sx={{ mt: 0.75 }} />
                    </Box>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth name="name" label="RFQ Title" value={form.name} onChange={handleChange} required />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth name="material" label="Material" value={form.material} onChange={handleChange} required helperText="Examples: Industrial Pallet Racks (Steel), Enterprise CRM Software Package" />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth name="quantity" label="Quantity" value={form.quantity} onChange={handleChange} required helperText="Example: 12 Tons / 2 Full Truck Loads" />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth name="pickup_location" label="Pickup Location (Origin)" value={form.pickup_location} onChange={handleChange} />
                      </Grid>
                      <Grid size={{ xs: 12 }}>
                        <TextField fullWidth name="delivery_location" label="Delivery Location (Destination)" value={form.delivery_location} onChange={handleChange} />
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Auction Timeline
                      </Typography>
                      <Divider sx={{ mt: 0.75 }} />
                    </Box>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <DateTimeField
                          name="bid_start_time"
                          label="Bid Start Date & Time"
                          value={form.bid_start_time}
                          onChange={handleChange}
                          min={baseMinDateTime}
                          helperText={`Captured in ${timezoneHint}, submitted as UTC`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <DateTimeField
                          name="bid_close_time"
                          label="Bid Close Date & Time"
                          value={form.bid_close_time}
                          onChange={handleChange}
                          min={getMinDateTime(form.bid_start_time) || baseMinDateTime}
                          helperText="Must be after Bid Start"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <DateTimeField
                          name="forced_close_time"
                          label="Forced Bid Close Date & Time"
                          value={form.forced_close_time}
                          onChange={handleChange}
                          min={getMinDateTime(form.bid_close_time) || baseMinDateTime}
                          helperText="Must be after Bid Close"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <DateTimeField
                          name="pickup_date"
                          label="Pickup / Service Date & Time"
                          value={form.pickup_date}
                          onChange={handleChange}
                          min={getMinDateTime(form.bid_start_time) || baseMinDateTime}
                          helperText="Must be after Bid Start"
                        />
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }} sx={{ mt: 0.5 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Extension Rules
                      </Typography>
                      <Divider sx={{ mt: 0.75 }} />
                    </Box>
                    <Grid container spacing={2}>
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
                          helperText="Bid received: any bid. Rank change: any bidder rank move. L1 change: only lowest bidder change."
                        >
                          {TRIGGER_OPTIONS.map((opt) => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                        </TextField>
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }} sx={{ mt: 0.5 }}>
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Visibility and Pricing
                      </Typography>
                      <Divider sx={{ mt: 0.75 }} />
                    </Box>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
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
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          select
                          fullWidth
                          name="bidder_visibility_mode"
                          label="Bidder Visibility"
                          value={form.bidder_visibility_mode}
                          onChange={handleChange}
                          helperText="Choose whether bidder identity is fully visible or masked."
                        >
                          {BIDDER_VISIBILITY_OPTIONS.map((opt) => (
                            <MenuItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" name="starting_price" label="Starting Price (INR)" value={form.starting_price} onChange={handleChange} inputProps={{ min: 0, step: "0.01" }} required />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField fullWidth type="number" name="minimum_decrement" label="Minimum Decrement (INR)" value={form.minimum_decrement} onChange={handleChange} inputProps={{ min: 0, step: "0.01" }} required />
                      </Grid>
                    </Grid>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12 }} sx={{ mt: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Technical Documents and Notes
                  </Typography>
                  <Divider sx={{ mt: 0.75 }} />
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Stack spacing={1.5}>
                    <Card variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle2">Technical Specs</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Upload one or more business documents (PDF, DOC, DOCX, XLS, XLSX, TXT). Max 5MB each.
                          </Typography>
                        </Box>
                        <Button
                          component="label"
                          variant="contained"
                          color="primary"
                          startIcon={<UploadFileOutlinedIcon />}
                          sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                        >
                          Upload file(s)
                          <input
                            type="file"
                            hidden
                            multiple
                            accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
                            onChange={(e) => {
                              const files = e.target.files;
                              void handleTechnicalSpecUpload(files);
                              e.target.value = "";
                            }}
                          />
                        </Button>
                      </Stack>
                      <Alert severity="warning" sx={{ mt: 1.25 }}>
                        Upload official technical documents only. Do not upload confidential, unlawful, or non-business content.
                      </Alert>
                    </Card>

                    <Card variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle2">Uploaded files</Typography>
                        <Chip size="small" label={`${uploadedFiles.length}`} />
                      </Stack>
                      {uploadedFiles.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No files uploaded yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1}>
                          {uploadedFiles.map((file) => (
                            <Box
                              key={file.id}
                              sx={{
                                border: 1,
                                borderColor: "divider",
                                borderRadius: 1.5,
                                p: 1.25,
                                bgcolor: "background.paper",
                              }}
                            >
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ sm: "center" }}
                                justifyContent="space-between"
                              >
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <DescriptionOutlinedIcon fontSize="small" color="action" />
                                  <Box>
                                    <Typography variant="body2">{file.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </Typography>
                                  </Box>
                                </Stack>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<VisibilityOutlinedIcon fontSize="small" />}
                                    onClick={() => setPreviewFile(file)}
                                  >
                                    Preview
                                  </Button>
                                  <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    startIcon={<DeleteOutlineOutlinedIcon fontSize="small" />}
                                    onClick={() => removeTechnicalSpec(file.id)}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </Stack>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </Card>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, lg: 6 }}>
                  <Card variant="outlined" sx={{ p: 1.5, height: "100%" }}>
                    <TextField
                      fullWidth
                      name="loading_unloading_notes"
                      label="Loading/Unloading Instructions"
                      value={form.loading_unloading_notes}
                      onChange={handleChange}
                      multiline
                      minRows={10}
                      maxRows={14}
                      helperText="Add loading bay constraints, handling requirements, safety notes, and service instructions."
                    />
                  </Card>
                </Grid>
              </Grid>
              <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                <Button variant="outlined" onClick={() => navigate('/auctions')}>Cancel</Button>
                <Button type="submit" variant="contained" startIcon={<SaveOutlinedIcon />} disabled={loading}>
                  {loading ? 'Creating...' : 'Create RFQ'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
      <Dialog open={Boolean(previewFile)} onClose={() => setPreviewFile(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="subtitle1" sx={{ pr: 2 }}>
            File preview{previewFile ? ` - ${previewFile.name}` : ""}
          </Typography>
          <IconButton onClick={() => setPreviewFile(null)} size="small" aria-label="Close preview">
            <CloseOutlinedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ minHeight: { xs: 380, md: 520 } }}>
          {previewFile?.url ? (
            <Box sx={{ height: "100%", minHeight: { xs: 340, md: 480 } }}>
              <iframe
                title={previewFile.name}
                src={previewFile.url}
                style={{ border: 0, width: "100%", height: "100%" }}
              />
            </Box>
          ) : (
            <Alert severity="info">Preview is not available for this file.</Alert>
          )}
          {previewFile?.url ? (
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
              <Button size="small" onClick={() => openFileLink(previewFile.url, previewFile.name)}>
                Open in new tab
              </Button>
            </Stack>
          ) : null}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
