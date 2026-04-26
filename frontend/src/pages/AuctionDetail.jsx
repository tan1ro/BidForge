import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import AddTaskOutlinedIcon from "@mui/icons-material/AddTaskOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PauseCircleOutlineOutlinedIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { getRFQ, getBids, getActivity, submitBid, updateRFQ, pauseRFQ } from "../api";
import { parseApiError } from "../utils/errorHandling";

const TRIGGER_LABELS = {
  bid_received: "Bid received in trigger window",
  rank_change: "Any supplier rank change",
  l1_change: "L1 rank change only",
};

const STATUS_LABELS = {
  upcoming: "Upcoming",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
  force_closed: "Force closed",
};
const TERMINAL_STATUSES = new Set(["closed", "force_closed"]);

function toLocalDateTimeInputValue(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function openBase64File(base64, contentType, fileName) {
  if (!base64) return;
  const url = `data:${contentType || "application/octet-stream"};base64,${base64}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "technical-spec";
  anchor.click();
}

function getTimeRemaining(targetDate) {
  const diff = new Date(targetDate) - new Date();
  if (diff <= 0) return { expired: true, text: "Expired" };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { expired: false, urgent: diff < 5 * 60 * 1000, text: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}` };
}

function getActivityMeta(eventType) {
  switch (eventType) {
    case "bid_submitted":
      return { icon: <DescriptionOutlinedIcon fontSize="small" />, color: "primary" };
    case "time_extended":
      return { icon: <AccessTimeOutlinedIcon fontSize="small" />, color: "warning" };
    case "rfq_created":
      return { icon: <AddTaskOutlinedIcon fontSize="small" />, color: "success" };
    case "auction_closed":
      return { icon: <LockOutlinedIcon fontSize="small" />, color: "default" };
    default:
      return { icon: <GavelOutlinedIcon fontSize="small" />, color: "default" };
  }
}

export default function AuctionDetail({ role }) {
  const theme = useTheme();
  const { id } = useParams();
  const location = useLocation();
  const timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
  const [rfq, setRfq] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidsMeta, setBidsMeta] = useState({ total: 0, page: 1, page_size: 10 });
  const [activity, setActivity] = useState([]);
  const [activityMeta, setActivityMeta] = useState({ total: 0, page: 1, page_size: 10 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("bids");
  const [showBidForm, setShowBidForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [timer, setTimer] = useState({ text: "--:--:--", urgent: false });
  const [toast, setToast] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError("");
      const [rfqRes, bidsRes, actRes] = await Promise.all([
        getRFQ(id),
        getBids(id, { page: bidsMeta.page, page_size: bidsMeta.page_size }),
        getActivity(id, { page: activityMeta.page, page_size: activityMeta.page_size }),
      ]);
      setRfq(rfqRes.data);
      const bidsPayload = Array.isArray(bidsRes.data) ? { items: bidsRes.data, total: bidsRes.data.length, page: 1, page_size: 10 } : bidsRes.data;
      const activityPayload = Array.isArray(actRes.data) ? { items: actRes.data, total: actRes.data.length, page: 1, page_size: 10 } : actRes.data;
      setBids(bidsPayload.items || []);
      setBidsMeta({ total: bidsPayload.total || 0, page: bidsPayload.page || 1, page_size: bidsPayload.page_size || 10 });
      setActivity(activityPayload.items || []);
      setActivityMeta({ total: activityPayload.total || 0, page: activityPayload.page || 1, page_size: activityPayload.page_size || 10 });
    } catch (err) {
      setLoadError(parseApiError(err, "Failed to load auction data"));
    } finally {
      setLoading(false);
    }
  }, [id, bidsMeta.page, bidsMeta.page_size, activityMeta.page, activityMeta.page_size]);

  useEffect(() => {
    const bootstrap = setTimeout(() => void loadData(), 0);
    const ws = new WebSocket(`ws://localhost:8000/api/ws/rfqs/${id}`);
    let isEffectActive = true;
    ws.onopen = () => {
      if (!isEffectActive) ws.close();
    };
    ws.onmessage = () => {
      if (isEffectActive) void loadData();
    };
    const interval = setInterval(loadData, 20000);
    return () => {
      isEffectActive = false;
      clearTimeout(bootstrap);
      clearInterval(interval);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [loadData, id]);

  useEffect(() => {
    if (!rfq) return;
    const tick = () => {
      const targetDate = rfq.status === "upcoming" ? rfq.bid_start_time : rfq.current_close_time;
      const remaining = getTimeRemaining(targetDate);
      setTimer(remaining.expired ? { text: rfq.status === "upcoming" ? "Starting..." : "Closing...", urgent: false, expired: true } : remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [rfq]);

  function showToastMessage(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) return <Typography>Loading auction details...</Typography>;
  if (loadError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void loadData()}>
            Retry
          </Button>
        }
      >
        {loadError}
      </Alert>
    );
  }
  if (!rfq) return <Alert severity="error">Auction not found.</Alert>;
  const canManageAuction = role === "buyer" && (rfq.status === "upcoming" || bids.length === 0);

  return (
    <Stack spacing={2.5}>
      {location.state?.createdReferenceId && (
        <Alert severity="success">
          RFQ created successfully. Reference ID: <strong>{location.state.createdReferenceId}</strong>
        </Alert>
      )}
      <Button component={Link} to="/" startIcon={<ArrowBackOutlinedIcon />} sx={{ width: "fit-content" }}>
        Back to auctions
      </Button>

      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
        <Box>
          <Typography variant="h4">{rfq.name}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">{rfq.reference_id}</Typography>
            <Chip
              label={STATUS_LABELS[rfq.status]}
              size="small"
              color={rfq.status === "active" ? "success" : rfq.status === "upcoming" ? "info" : "default"}
            />
            {TERMINAL_STATUSES.has(rfq.status) && rfq.winner_carrier && (
              <Chip size="small" color="success" label={`Winner: ${rfq.winner_carrier}`} />
            )}
          </Stack>
          {TERMINAL_STATUSES.has(rfq.status) && rfq.winning_bid_total != null && (
            <Typography variant="caption" color="text.secondary">
              Winning total: {formatCurrency(rfq.winning_bid_total)}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          {canManageAuction && (
            <>
              <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setShowEditForm(true)}>
                Edit auction
              </Button>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<PauseCircleOutlineOutlinedIcon />}
                disabled={busyAction || rfq.status === "paused"}
                onClick={async () => {
                  setBusyAction(true);
                  try {
                    await pauseRFQ(id);
                    await loadData();
                    showToastMessage("Auction paused successfully.");
                  } catch (err) {
                    showToastMessage(parseApiError(err, "Failed to pause auction"), "error");
                  } finally {
                    setBusyAction(false);
                  }
                }}
              >
                Pause auction
              </Button>
            </>
          )}
          {rfq.status === "active" && role === "supplier" && (
            <Button variant="contained" startIcon={<SendOutlinedIcon />} onClick={() => setShowBidForm(true)}>
              Submit bid
            </Button>
          )}
        </Stack>
      </Stack>

      {(rfq.status === "active" || rfq.status === "upcoming") && (
        <Card sx={{ background: `linear-gradient(120deg, ${alpha(theme.palette.primary.main, 0.16)} 0%, ${alpha(theme.palette.secondary.main, 0.14)} 100%)` }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography color="text.secondary" variant="body2">Auction status</Typography>
                <Chip
                  label={STATUS_LABELS[rfq.status]}
                  size="small"
                  color={rfq.status === "active" ? "success" : "info"}
                  sx={{ mt: 0.5 }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography color="text.secondary" variant="body2">{rfq.status === "upcoming" ? "Starts in" : "Time remaining"}</Typography>
                <Typography variant="h5" color={timer.urgent ? "error.main" : "text.primary"}>{timer.text}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Typography color="text.secondary" variant="body2">Current close</Typography>
                <Typography>{formatDate(rfq.current_close_time)}</Typography>
              </Grid>
            </Grid>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography color="text.secondary" variant="body2">Material</Typography>
                <Typography>{rfq.material || "—"}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography color="text.secondary" variant="body2">Quantity</Typography>
                <Typography>{rfq.quantity || "—"}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography color="text.secondary" variant="body2">Pickup Location</Typography>
                <Typography>{rfq.pickup_location || "—"}</Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <Typography color="text.secondary" variant="body2">Delivery Location</Typography>
                <Typography>{rfq.delivery_location || "—"}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 2 }}>
                <Tab label={`Bids (${bids.length})`} value="bids" />
                <Tab label={`Activity (${activity.length})`} value="activity" />
              </Tabs>

              {activeTab === "bids" && (
                <>
                  {bids.length === 0 ? (
                    <Alert severity="info">No bids submitted yet.</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>Carrier</TableCell>
                            <TableCell>Freight</TableCell>
                            <TableCell>Origin</TableCell>
                            <TableCell>Destination</TableCell>
                            <TableCell>Total</TableCell>
                            <TableCell>Transit</TableCell>
                            <TableCell>Validity</TableCell>
                            <TableCell>Vehicle</TableCell>
                            <TableCell>Capacity</TableCell>
                            <TableCell>Insurance</TableCell>
                            <TableCell>Submitted At</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {bids.map((bid) => (
                            <TableRow key={bid.id}>
                              <TableCell>
                                <Stack direction="row" spacing={0.75}>
                                  <Chip size="small" label={`L${bid.rank}`} color={bid.rank === 1 ? "success" : "default"} />
                                  {TERMINAL_STATUSES.has(rfq.status) && bid.rank === 1 && <Chip size="small" color="success" label="Winner" />}
                                </Stack>
                              </TableCell>
                              <TableCell>{bid.carrier_name}</TableCell>
                              <TableCell>{formatCurrency(bid.freight_charges)}</TableCell>
                              <TableCell>{formatCurrency(bid.origin_charges)}</TableCell>
                              <TableCell>{formatCurrency(bid.destination_charges)}</TableCell>
                              <TableCell>{formatCurrency(bid.total_price)}</TableCell>
                              <TableCell>{bid.transit_time} days</TableCell>
                              <TableCell>{bid.validity}</TableCell>
                              <TableCell>{bid.vehicle_type || "—"}</TableCell>
                              <TableCell>{bid.capacity_tons ? `${bid.capacity_tons} tons` : "—"}</TableCell>
                              <TableCell>{bid.insurance_included ? "Included" : "Not Included"}</TableCell>
                              <TableCell>{formatDate(bid.created_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  {bidsMeta.total > bidsMeta.page_size && (
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
                      <Button variant="outlined" disabled={bidsMeta.page === 1} onClick={() => setBidsMeta((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}>Previous</Button>
                      <Typography color="text.secondary" sx={{ alignSelf: "center" }}>Page {bidsMeta.page}</Typography>
                      <Button variant="outlined" disabled={bidsMeta.page * bidsMeta.page_size >= bidsMeta.total} onClick={() => setBidsMeta((prev) => ({ ...prev, page: prev.page + 1 }))}>Next</Button>
                    </Stack>
                  )}
                </>
              )}

              {activeTab === "activity" && (
                <>
                  {activity.length === 0 ? (
                    <Alert severity="info">No activity recorded yet.</Alert>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: "20%" }}>Event</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell sx={{ width: "24%" }}>Timestamp</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {activity.map((log) => {
                            const meta = getActivityMeta(log.event_type);
                            return (
                              <TableRow key={log.id} hover>
                                <TableCell>
                                  <Chip icon={meta.icon} label={log.event_type} size="small" color={meta.color} />
                                </TableCell>
                                <TableCell>{log.description}</TableCell>
                                <TableCell>{formatDate(log.created_at)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                  {activityMeta.total > activityMeta.page_size && (
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 2 }}>
                      <Button variant="outlined" disabled={activityMeta.page === 1} onClick={() => setActivityMeta((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}>Previous</Button>
                      <Typography color="text.secondary" sx={{ alignSelf: "center" }}>Page {activityMeta.page}</Typography>
                      <Button variant="outlined" disabled={activityMeta.page * activityMeta.page_size >= activityMeta.total} onClick={() => setActivityMeta((prev) => ({ ...prev, page: prev.page + 1 }))}>Next</Button>
                    </Stack>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {role === "buyer" && (
          <Grid size={{ xs: 12, lg: 4 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Auction configuration</Typography>
                <Stack spacing={1}>
                  <Typography variant="body2"><strong>Bid Start:</strong> {formatDate(rfq.bid_start_time)}</Typography>
                  <Typography variant="body2"><strong>Original Close:</strong> {formatDate(rfq.bid_close_time)}</Typography>
                  <Typography variant="body2"><strong>Current Close:</strong> {formatDate(rfq.current_close_time)}</Typography>
                  <Typography variant="body2"><strong>Forced Close:</strong> {formatDate(rfq.forced_close_time)}</Typography>
                  <Typography variant="body2"><strong>Trigger:</strong> {TRIGGER_LABELS[rfq.extension_trigger]}</Typography>
                  <Typography variant="body2"><strong>Trigger Window:</strong> {rfq.trigger_window_minutes} minutes</Typography>
                  <Typography variant="body2"><strong>Extension:</strong> {rfq.extension_duration_minutes} minutes</Typography>
                  <Typography variant="body2"><strong>Auction Type:</strong> {rfq.auction_type || "Reverse Auction (lowest wins)"}</Typography>
                  <Typography variant="body2"><strong>Starting Price:</strong> {formatCurrency(rfq.starting_price)}</Typography>
                  <Typography variant="body2"><strong>Minimum Decrement:</strong> {formatCurrency(rfq.minimum_decrement)}</Typography>
                  <Typography variant="body2"><strong>Specs Attachment:</strong> {rfq.technical_specs_attachment || "Not provided"}</Typography>
                  {rfq.technical_specs_file_base64 && (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ px: 0, justifyContent: "flex-start" }}
                      onClick={() => openBase64File(rfq.technical_specs_file_base64, rfq.technical_specs_content_type, rfq.technical_specs_file_name)}
                    >
                      Download uploaded technical specs
                    </Button>
                  )}
                  <Typography variant="body2"><strong>Loading Instructions:</strong> {rfq.loading_unloading_notes || "Not provided"}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Times shown in {timezoneLabel}. Backend stores UTC.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {showBidForm && (
        <BidFormDialog
          rfqId={id}
          onClose={() => setShowBidForm(false)}
          onSuccess={() => {
            setShowBidForm(false);
            loadData();
            showToastMessage("Bid submitted successfully.");
          }}
          onError={(msg) => showToastMessage(msg, "error")}
        />
      )}
      {showEditForm && (
        <EditRFQDialog
          rfq={rfq}
          onClose={() => setShowEditForm(false)}
          onSuccess={async (payload) => {
            try {
              await updateRFQ(id, payload);
              setShowEditForm(false);
              await loadData();
              showToastMessage("Auction updated successfully.");
            } catch (err) {
              showToastMessage(parseApiError(err, "Failed to update auction"), "error");
            }
          }}
        />
      )}

      {toast && (
        <Alert
          severity={toast.type === "error" ? "error" : "success"}
          variant="filled"
          sx={{ position: "fixed", right: 24, bottom: 24, zIndex: 1400, maxWidth: 360 }}
        >
          {toast.message}
        </Alert>
      )}
    </Stack>
  );
}

function EditRFQDialog({ rfq, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: rfq.name || "",
    material: rfq.material || "",
    quantity: rfq.quantity || "",
    pickup_location: rfq.pickup_location || "",
    delivery_location: rfq.delivery_location || "",
    bid_start_time: toLocalDateTimeInputValue(rfq.bid_start_time),
    bid_close_time: toLocalDateTimeInputValue(rfq.bid_close_time),
    forced_close_time: toLocalDateTimeInputValue(rfq.forced_close_time),
    pickup_date: toLocalDateTimeInputValue(rfq.pickup_date),
    trigger_window_minutes: String(rfq.trigger_window_minutes ?? 10),
    extension_duration_minutes: String(rfq.extension_duration_minutes ?? 5),
    extension_trigger: rfq.extension_trigger || "bid_received",
    starting_price: String(rfq.starting_price ?? 0),
    minimum_decrement: String(rfq.minimum_decrement ?? 0),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Edit auction</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="RFQ Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Material" value={form.material} onChange={(e) => setForm((p) => ({ ...p, material: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Quantity" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Pickup Location" value={form.pickup_location} onChange={(e) => setForm((p) => ({ ...p, pickup_location: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Delivery Location" value={form.delivery_location} onChange={(e) => setForm((p) => ({ ...p, delivery_location: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="datetime-local" label="Bid Start" InputLabelProps={{ shrink: true }} value={form.bid_start_time} onChange={(e) => setForm((p) => ({ ...p, bid_start_time: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="datetime-local" label="Bid Close" InputLabelProps={{ shrink: true }} value={form.bid_close_time} onChange={(e) => setForm((p) => ({ ...p, bid_close_time: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="datetime-local" label="Forced Close" InputLabelProps={{ shrink: true }} value={form.forced_close_time} onChange={(e) => setForm((p) => ({ ...p, forced_close_time: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="datetime-local" label="Pickup Date" InputLabelProps={{ shrink: true }} value={form.pickup_date} onChange={(e) => setForm((p) => ({ ...p, pickup_date: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth type="number" label="Trigger Window (min)" value={form.trigger_window_minutes} onChange={(e) => setForm((p) => ({ ...p, trigger_window_minutes: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField fullWidth type="number" label="Extension Duration (min)" value={form.extension_duration_minutes} onChange={(e) => setForm((p) => ({ ...p, extension_duration_minutes: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField select fullWidth label="Extension Trigger" value={form.extension_trigger} onChange={(e) => setForm((p) => ({ ...p, extension_trigger: e.target.value }))} helperText="Choose what event can auto-extend the British Auction in trigger window.">
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <InfoOutlinedIcon fontSize="inherit" />
              <Typography variant="caption" color="text.secondary">
                `Bid received` extends on any bid, `Rank change` extends when supplier order changes, and `L1 change` extends only when lowest bidder changes.
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="number" label="Starting Price (INR)" value={form.starting_price} onChange={(e) => setForm((p) => ({ ...p, starting_price: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="number" label="Minimum Decrement (INR)" value={form.minimum_decrement} onChange={(e) => setForm((p) => ({ ...p, minimum_decrement: e.target.value }))} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => onSuccess({
            ...form,
            bid_start_time: new Date(form.bid_start_time).toISOString(),
            bid_close_time: new Date(form.bid_close_time).toISOString(),
            forced_close_time: new Date(form.forced_close_time).toISOString(),
            pickup_date: new Date(form.pickup_date).toISOString(),
            trigger_window_minutes: Number(form.trigger_window_minutes),
            extension_duration_minutes: Number(form.extension_duration_minutes),
            starting_price: Number(form.starting_price),
            minimum_decrement: Number(form.minimum_decrement),
          })}
        >
          Save changes
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BidFormDialog({ rfqId, onClose, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    carrier_name: "",
    freight_charges: "",
    origin_charges: "",
    destination_charges: "",
    transit_time: "1",
    validity: "7 days",
    vehicle_type: "",
    capacity_tons: "",
    insurance_included: false,
  });

  const freight = Number(form.freight_charges || 0);
  const origin = Number(form.origin_charges || 0);
  const destination = Number(form.destination_charges || 0);
  const transitDays = Number(form.transit_time || 0);
  const total = freight + origin + destination;
  const isSubmitDisabled =
    loading ||
    !form.carrier_name.trim() ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(transitDays) ||
    transitDays < 1;

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    if (!form.carrier_name.trim()) {
      setFormError("Carrier name is required");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setFormError("Total bid amount must be greater than zero");
      return;
    }
    if (!Number.isFinite(transitDays) || transitDays < 1) {
      setFormError("Transit time must be at least 1 day");
      return;
    }

    setLoading(true);
    try {
      await submitBid(rfqId, {
        carrier_name: form.carrier_name.trim(),
        freight_charges: freight || 0,
        origin_charges: origin || 0,
        destination_charges: destination || 0,
        transit_time: Math.max(1, Math.trunc(transitDays)),
        validity: form.validity,
        vehicle_type: form.vehicle_type.trim(),
        capacity_tons: Number(form.capacity_tons || 0),
        insurance_included: Boolean(form.insurance_included),
      });
      onSuccess();
    } catch (err) {
      onError(parseApiError(err, "Failed to submit bid"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Submit bid</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Carrier name"
              value={form.carrier_name}
              onChange={(e) => handleChange("carrier_name", e.target.value)}
              required
              fullWidth
              autoComplete="organization"
              placeholder="Enter carrier/company name"
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Freight charges"
                  type="number"
                  value={form.freight_charges}
                  onChange={(e) => handleChange("freight_charges", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: "0.01" }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Origin charges"
                  type="number"
                  value={form.origin_charges}
                  onChange={(e) => handleChange("origin_charges", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: "0.01" }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Destination charges"
                  type="number"
                  value={form.destination_charges}
                  onChange={(e) => handleChange("destination_charges", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: "0.01" }}
                />
              </Grid>
            </Grid>
            <TextField
              label="Transit time (days)"
              type="number"
              value={form.transit_time}
              onChange={(e) => handleChange("transit_time", e.target.value)}
              fullWidth
              inputProps={{ min: 1, step: 1 }}
            />
            <TextField
              select
              label="Quote validity"
              value={form.validity}
              onChange={(e) => handleChange("validity", e.target.value)}
              fullWidth
            >
              <MenuItem value="7 days">7 days</MenuItem>
              <MenuItem value="15 days">15 days</MenuItem>
              <MenuItem value="30 days">30 days</MenuItem>
            </TextField>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Vehicle type"
                  value={form.vehicle_type}
                  onChange={(e) => handleChange("vehicle_type", e.target.value)}
                  fullWidth
                  placeholder="e.g. 20 ft Truck"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Capacity (tons)"
                  type="number"
                  value={form.capacity_tons}
                  onChange={(e) => handleChange("capacity_tons", e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: "0.1" }}
                />
              </Grid>
            </Grid>
            <TextField
              select
              label="Insurance"
              value={form.insurance_included ? "yes" : "no"}
              onChange={(e) => handleChange("insurance_included", e.target.value === "yes")}
              fullWidth
            >
              <MenuItem value="yes">Included</MenuItem>
              <MenuItem value="no">Not Included</MenuItem>
            </TextField>
            <Typography variant="caption" color="text.secondary">
              Total formula: Freight + Origin + Destination
            </Typography>
            <Typography variant="subtitle2">
              Total amount: {formatCurrency(total)} ({formatCurrency(freight)} + {formatCurrency(origin)} + {formatCurrency(destination)})
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitDisabled}>
            Submit
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
