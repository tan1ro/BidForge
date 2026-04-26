import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { listRFQs, deleteRFQ, cloneRFQ } from '../api';
import { parseApiError } from "../utils/errorHandling";

const STATUS_LABELS = {
  upcoming: 'Upcoming',
  active: 'Active',
  paused: 'Paused',
  closed: 'Closed',
  force_closed: 'Force Closed',
};

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatCurrency(val) {
  if (val == null) return '—';
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function countdownTo(target) {
  const end = new Date(target).getTime() - Date.now();
  if (end <= 0) return "—";
  const s = Math.floor(end / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function statusColor(status) {
  if (status === "active") return "success";
  if (status === "paused") return "warning";
  if (status === "upcoming") return "info";
  if (status === "closed") return "warning";
  if (status === "force_closed") return "error";
  return "default";
}

export default function RFQList({ role }) {
  const timezoneLabel = Intl.DateTimeFormat().resolvedOptions().timeZone || "local timezone";
  const [rfqs, setRfqs] = useState([]);
  const [totalRFQs, setTotalRFQs] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [snack, setSnack] = useState({ open: false, message: "", severity: "success" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef(null);
  const prevCloseByIdRef = useRef({});

  const loadRFQs = useCallback(async () => {
    try {
      setLoadError("");
      const statusFilter = filter === 'all' ? undefined : (filter === 'closed' ? 'closed' : filter);
      const res = await listRFQs({ page, page_size: pageSize, status: statusFilter });
      const payload = Array.isArray(res.data) ? { items: res.data, total: res.data.length } : res.data;
      const items = payload.items || [];
      const prevMap = prevCloseByIdRef.current;
      for (const r of items) {
        const id = r.id;
        if (!id) continue;
        const oldT = prevMap[id];
        const newT = r.current_close_time;
        if (
          oldT &&
          newT &&
          new Date(newT) > new Date(oldT) &&
          (r.status === "active" || r.status === "upcoming" || r.status === "paused")
        ) {
          setSnack({
            open: true,
            severity: "info",
            message: `Auction "${r.name}" was extended. New close: ${formatDate(newT)}`,
          });
          break;
        }
      }
      const next = { ...prevMap };
      for (const r of items) {
        if (r.id) next[r.id] = r.current_close_time;
      }
      prevCloseByIdRef.current = next;

      setRfqs(items);
      setTotalRFQs(payload.total || 0);
    } catch (err) {
      setLoadError(parseApiError(err, "Failed to load auctions"));
    } finally {
      setLoading(false);
    }
  }, [filter, page, pageSize]);

  useEffect(() => {
    const bootstrap = setTimeout(() => {
      void loadRFQs();
    }, 0);
    intervalRef.current = setInterval(() => {
      void loadRFQs();
    }, 10000);
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      clearTimeout(bootstrap);
      clearInterval(intervalRef.current);
      clearInterval(t);
    };
  }, [loadRFQs]);

  async function handleClone(rfq) {
    if (role !== "buyer") return;
    try {
      const { data } = await cloneRFQ(rfq.id);
      showToast(`Cloned. New reference: ${data?.reference_id || ""}`);
      loadRFQs();
    } catch (err) {
      showToast(parseApiError(err, "Failed to clone RFQ"), "error");
    }
  }

  async function handleDelete(rfq) {
    try {
      await deleteRFQ(rfq.id);
      setConfirmDelete(null);
      showToast(`RFQ "${rfq.name}" deleted successfully`);
      loadRFQs();
    } catch (err) {
      showToast(parseApiError(err, "Failed to delete RFQ"), 'error');
    }
  }

  function showToast(message, type = "success") {
    const severity = type === "error" ? "error" : type === "info" ? "info" : "success";
    setSnack({ open: true, message, severity });
  }

  void tick;

  let filtered = filter === 'all'
    ? rfqs
    : filter === 'closed'
      ? rfqs.filter(r => r.status === 'closed' || r.status === 'force_closed')
      : rfqs.filter(r => r.status === filter);

  // Apply search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(r => 
      r.name.toLowerCase().includes(q) || 
      r.reference_id.toLowerCase().includes(q)
    );
  }

  // Apply sorting
  filtered = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'created_desc':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'created_asc':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'close_date_asc':
        return new Date(a.current_close_time) - new Date(b.current_close_time);
      case 'close_date_desc':
        return new Date(b.current_close_time) - new Date(a.current_close_time);
      case 'bids_desc':
        return b.total_bids - a.total_bids;
      default:
        return 0;
    }
  });

  const counts = {
    all: totalRFQs,
    active: rfqs.filter(r => r.status === 'active').length,
    upcoming: rfqs.filter(r => r.status === 'upcoming').length,
    closed: rfqs.filter(r => r.status === 'closed' || r.status === 'force_closed').length,
  };

  if (loading) {
    return (
      <Stack spacing={1}>
        <Typography variant="h5">Loading British auctions...</Typography>
        <Typography color="text.secondary">Fetching latest RFQ status and bid insights.</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h4">British Auctions</Typography>
          <Typography color="text.secondary">Manage and monitor RFQ auctions</Typography>
          <Typography variant="caption" color="text.secondary">
            All times shown in {timezoneLabel}
          </Typography>
        </Box>
        {role === "buyer" && (
          <Button component={Link} to="/create" variant="contained" startIcon={<AddCircleOutlineIcon />}>
            Create RFQ
          </Button>
        )}
      </Stack>

      <Grid container spacing={2}>
        {[["Total RFQs", counts.all], ["Active", counts.active], ["Upcoming", counts.upcoming], ["Closed", counts.closed]].map(([label, value]) => (
          <Grid key={label} size={{ xs: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" variant="body2">{label}</Typography>
                <Typography variant="h5">{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by RFQ name or reference ID"
            fullWidth
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <TextField select value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="upcoming">Upcoming</MenuItem>
            <MenuItem value="closed">Closed</MenuItem>
          </TextField>
          <TextField select value={sortBy} onChange={(e) => setSortBy(e.target.value)} sx={{ minWidth: 180 }}>
            <MenuItem value="created_desc">Newest Created</MenuItem>
            <MenuItem value="created_asc">Oldest Created</MenuItem>
            <MenuItem value="close_date_asc">Closing Soon</MenuItem>
            <MenuItem value="close_date_desc">Closing Latest</MenuItem>
            <MenuItem value="bids_desc">Most Bids</MenuItem>
          </TextField>
        </Stack>
      </Paper>
      {loadError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void loadRFQs()}>Retry</Button>}>
          {loadError}
        </Alert>
      )}

      {filtered.length === 0 ? (
        <Alert severity="info">No auctions found for the selected filters.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>RFQ Name</TableCell>
                <TableCell>RFQ ID</TableCell>
                <TableCell>Route</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Lowest Bid</TableCell>
                <TableCell>Bids</TableCell>
                <TableCell>Bid opens</TableCell>
                <TableCell>Current close / countdown</TableCell>
                <TableCell>Forced Close</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((rfq) => (
                <TableRow key={rfq.id} hover>
                  <TableCell>{rfq.name}</TableCell>
                  <TableCell>{rfq.reference_id}</TableCell>
                  <TableCell>{rfq.pickup_location && rfq.delivery_location ? `${rfq.pickup_location} -> ${rfq.delivery_location}` : "—"}</TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABELS[rfq.status]} color={statusColor(rfq.status)} />
                  </TableCell>
                  <TableCell>{formatCurrency(rfq.lowest_bid)}</TableCell>
                  <TableCell>{rfq.total_bids}</TableCell>
                  <TableCell>{formatDate(rfq.bid_start_time)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{formatDate(rfq.current_close_time)}</Typography>
                    {rfq.status === "active" && (
                      <Typography variant="caption" color="primary">
                        {countdownTo(rfq.current_close_time)} left
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(rfq.forced_close_time)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button component={Link} to={`/auction/${rfq.id}`} size="small" startIcon={<VisibilityOutlinedIcon />}>View</Button>
                      {role === "buyer" && (
                        <>
                          <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => void handleClone(rfq)}>
                            Clone
                          </Button>
                          <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirmDelete(rfq)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Stack direction="row" justifyContent="space-between" sx={{ pt: 0.5 }}>
        <Button variant="outlined" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
        <Typography color="text.secondary" sx={{ alignSelf: "center" }}>Page {page}</Typography>
        <Button variant="outlined" disabled={page * pageSize >= totalRFQs} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </Stack>

      <Dialog open={Boolean(confirmDelete) && role === "buyer"} onClose={() => setConfirmDelete(null)}>
        <DialogTitle>Delete RFQ?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will delete the RFQ and all associated bids and activity logs permanently.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
