import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Skeleton,
  Snackbar,
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
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import WorkspacePremiumOutlinedIcon from "@mui/icons-material/WorkspacePremiumOutlined";
import {
  getRFQ,
  getBids,
  getActivity,
  updateRFQ,
  pauseRFQ,
  awardRFQ,
  exportActivity,
  exportBids,
  getWebSocketBase,
} from "../api";
import { parseApiError } from "../utils/errorHandling";
import {
  TRIGGER_LABELS,
  BIDDER_VISIBILITY_LABELS,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  formatDate,
  formatCurrency,
  openFileLink,
  getTimeRemaining,
  getPreferredTimezoneLabel,
} from "../utils/auctionFormatters";
import BidFormDialog from "../components/auction/BidFormDialog";
import EditRFQDialog from "../components/auction/EditRFQDialog";
import AwardWinnerDialog from "../components/auction/AwardWinnerDialog";

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
  const timezoneLabel = getPreferredTimezoneLabel();
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
  const [showAwardDialog, setShowAwardDialog] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [timer, setTimer] = useState({ text: "--:--:--", urgent: false });
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  const [activityEventType, setActivityEventType] = useState("");
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const boundaryRefreshAtRef = useRef(0);

  const showToastMessage = useCallback((message, type = "success") => {
    setSnack({ open: true, message, severity: type === "error" ? "error" : "success" });
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoadError("");
      const [rfqRes, bidsRes, actRes] = await Promise.all([
        getRFQ(id),
        getBids(id, { page: bidsMeta.page, page_size: bidsMeta.page_size }),
        getActivity(id, {
          page: activityMeta.page,
          page_size: activityMeta.page_size,
          event_type: activityEventType || undefined,
        }),
      ]);
      setRfq(rfqRes.data);
      if (rfqRes.data?.server_time) {
        setServerOffsetMs(new Date(rfqRes.data.server_time).getTime() - Date.now());
      }
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
  }, [id, bidsMeta.page, bidsMeta.page_size, activityMeta.page, activityMeta.page_size, activityEventType]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(id);
  }, [loadData]);

  useEffect(() => {
    const token = typeof localStorage?.getItem === "function" ? localStorage.getItem("auth_token") : null;
    const wsBase = getWebSocketBase();
    const ws = token ? new WebSocket(`${wsBase}/api/ws/rfqs/${id}`, ["token", token]) : null;
    let isEffectActive = true;
    if (ws) {
      ws.onopen = () => {
        if (!isEffectActive) ws.close();
      };
      ws.onmessage = (ev) => {
        if (!isEffectActive) return;
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (msg?.type === "time_extended") {
            setSnack((s) => ({
              ...s,
              open: true,
              severity: "info",
              message: `Auction extended. New close (UTC) updated — refresh in progress.`,
            }));
          }
        } catch {
          /* ignore */
        }
        void loadData();
      };
    }
    return () => {
      isEffectActive = false;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [loadData, id]);

  useEffect(() => {
    if (!rfq) return;
    const tick = () => {
      const targetDate = rfq.status === "upcoming" ? rfq.bid_start_time : rfq.current_close_time;
      const remaining = getTimeRemaining(targetDate, Date.now() + serverOffsetMs);
      setTimer(remaining.expired ? { text: rfq.status === "upcoming" ? "Starting..." : "Closing...", urgent: false, expired: true } : remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [rfq, serverOffsetMs]);

  useEffect(() => {
    if (!rfq || !timer.expired) return;
    if (!(rfq.status === "upcoming" || rfq.status === "active")) return;
    const now = Date.now();
    // Keep UI and backend status aligned right at start/close boundary.
    if (now - boundaryRefreshAtRef.current < 2000) return;
    boundaryRefreshAtRef.current = now;
    const id = setTimeout(() => {
      void loadData();
    }, 300);
    return () => clearTimeout(id);
  }, [rfq, timer.expired, loadData]);

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ maxWidth: 900 }}>
        <Skeleton variant="text" width={120} height={32} />
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 1 }} />
      </Stack>
    );
  }
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
  const isAuctionOver = TERMINAL_STATUSES.has(rfq.status);
  const canEditAuction = role === "rfqowner" && !isAuctionOver;
  const canPauseAuction = role === "rfqowner" && !isAuctionOver && (rfq.status === "upcoming" || bids.length === 0);
  const lowestTotal = bids.length > 0 ? Math.min(...bids.map((b) => Number(b.total_price || 0))) : Number(rfq.starting_price || 0);
  const decrementBlocksBidding = Number(rfq.minimum_decrement || 0) >= lowestTotal && lowestTotal > 0;

  return (
    <Stack spacing={2.5}>
      {location.state?.createdReferenceId && (
        <Alert severity="success">
          RFQ created successfully. Reference ID: <strong>{location.state.createdReferenceId}</strong>
        </Alert>
      )}
      <Button component={Link} to="/auctions" startIcon={<ArrowBackOutlinedIcon />} sx={{ width: "fit-content" }}>
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
            {rfq.awarded_bidder && (
              <Chip size="small" color="secondary" label={`Awarded: ${rfq.awarded_bidder}`} />
            )}
          </Stack>
          {TERMINAL_STATUSES.has(rfq.status) && rfq.winning_bid_total != null && (
            <Typography variant="caption" color="text.secondary">
              Winning total: {formatCurrency(rfq.winning_bid_total)}
            </Typography>
          )}
          {rfq.awarded_at && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Awarded at: {formatDate(rfq.awarded_at)}{rfq.award_note ? ` - ${rfq.award_note}` : ""}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          {role === "rfqowner" && (
            <>
              <Button
                variant="outlined"
                startIcon={<DownloadOutlinedIcon />}
                onClick={async () => {
                  try {
                    const response = await exportActivity(id, { format: "csv" });
                    const blobUrl = URL.createObjectURL(response.data);
                    openFileLink(blobUrl, `${rfq.reference_id || "rfq"}-activity.csv`);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                  } catch (err) {
                    showToastMessage(parseApiError(err, "Failed to export activity timeline"), "error");
                  }
                }}
              >
                Export Timeline
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadOutlinedIcon />}
                onClick={async () => {
                  try {
                    const response = await exportBids(id, { format: "csv" });
                    const blobUrl = URL.createObjectURL(response.data);
                    openFileLink(blobUrl, `${rfq.reference_id || "rfq"}-bids.csv`);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                  } catch (err) {
                    showToastMessage(parseApiError(err, "Failed to export bids"), "error");
                  }
                }}
              >
                Export bids
              </Button>
            </>
          )}
          {canEditAuction && (
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setShowEditForm(true)}>
              Edit auction
            </Button>
          )}
          {canPauseAuction && (
            <>
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
          {role === "rfqowner" && TERMINAL_STATUSES.has(rfq.status) && !rfq.awarded_bid_id && bids.length > 0 && (
            <Button variant="contained" color="secondary" startIcon={<WorkspacePremiumOutlinedIcon />} onClick={() => setShowAwardDialog(true)}>
              Award Winner
            </Button>
          )}
          {rfq.status === "active" && role === "bidder" && (
            <Button variant="contained" startIcon={<SendOutlinedIcon />} onClick={() => setShowBidForm(true)}>
              Submit bid
            </Button>
          )}
        </Stack>
      </Stack>
      {decrementBlocksBidding && (
        <Alert severity="warning">
          Current minimum decrement may block further valid bids. Reduce minimum decrement below current lowest bid.
        </Alert>
      )}

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
      {role === "bidder" && (rfq.owner_about_company || rfq.owner_company_url) && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>About Buyer Company</Typography>
            {rfq.owner_company_url && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                Website: {rfq.owner_company_url}
              </Typography>
            )}
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {rfq.owner_about_company || "Not provided"}
            </Typography>
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
                    <Alert severity="info">
                      No bids yet. Bidders can submit quotes while the auction is active. Share the auction link and monitor rank changes in real time.
                    </Alert>
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
                              <TableCell>
                                <Stack spacing={0.25}>
                                  <Typography variant="body2">{bid.carrier_name}</Typography>
                                  {bid.carrier_account_name && bid.carrier_account_name !== bid.carrier_name && (
                                    <Typography variant="caption" color="text.secondary">
                                      (account: {bid.carrier_account_name})
                                    </Typography>
                                  )}
                                </Stack>
                              </TableCell>
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
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
                    <TextField
                      size="small"
                      select
                      label="Event type"
                      value={activityEventType}
                      onChange={(e) => {
                        setActivityEventType(e.target.value);
                        setActivityMeta((m) => ({ ...m, page: 1 }));
                      }}
                      sx={{ minWidth: 220 }}
                    >
                      <MenuItem value="">All events</MenuItem>
                      <MenuItem value="time_extended">Time extended</MenuItem>
                      <MenuItem value="bid_submitted">Bid submitted</MenuItem>
                      <MenuItem value="rfq_created">RFQ created</MenuItem>
                      <MenuItem value="auction_closed">Auction closed</MenuItem>
                      <MenuItem value="rfq_updated">RFQ updated</MenuItem>
                    </TextField>
                  </Stack>
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

        {role === "rfqowner" && (
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
                  <Typography variant="body2"><strong>Bidder Visibility:</strong> {BIDDER_VISIBILITY_LABELS[rfq.bidder_visibility_mode] || BIDDER_VISIBILITY_LABELS.full_rank}</Typography>
                  <Typography variant="body2"><strong>Trigger Window:</strong> {rfq.trigger_window_minutes} minutes</Typography>
                  <Typography variant="body2"><strong>Extension:</strong> {rfq.extension_duration_minutes} minutes</Typography>
                  <Typography variant="body2"><strong>Auction Type:</strong> {rfq.auction_type || "Reverse Auction (lowest wins)"}</Typography>
                  <Typography variant="body2"><strong>Starting Price:</strong> {formatCurrency(rfq.starting_price)}</Typography>
                  <Typography variant="body2"><strong>Minimum Decrement:</strong> {formatCurrency(rfq.minimum_decrement)}</Typography>
                  <Typography variant="body2"><strong>Specs Attachment:</strong> {rfq.technical_specs_attachment || "Not provided"}</Typography>
                  {rfq.technical_specs_url && (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ px: 0, justifyContent: "flex-start" }}
                      onClick={() => openFileLink(rfq.technical_specs_url, rfq.technical_specs_file_name)}
                    >
                      Open technical specs
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
          rfq={rfq}
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
      {showAwardDialog && (
        <AwardWinnerDialog
          bids={bids}
          onClose={() => setShowAwardDialog(false)}
          onSubmit={async ({ bidId, awardNote }) => {
            try {
              await awardRFQ(id, { bid_id: bidId, award_note: awardNote });
              setShowAwardDialog(false);
              await loadData();
              showToastMessage("Winner awarded successfully.");
            } catch (err) {
              showToastMessage(parseApiError(err, "Failed to award winner"), "error");
            }
          }}
        />
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={6000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setSnack((s) => ({ ...s, open: false }));
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          elevation={4}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
