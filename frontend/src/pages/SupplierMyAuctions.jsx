import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { getSupplierMyAuctions } from "../api";
import { parseApiError } from "../utils/errorHandling";

function formatShort(dateStr) {
  return new Date(dateStr).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function countDownTo(target) {
  const end = new Date(target).getTime();
  return () => {
    const t = end - Date.now();
    if (t <= 0) return "Closed";
    const s = Math.floor(t / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };
}

export default function SupplierMyAuctions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [nowTick, setNowTick] = useState(0);

  const load = useCallback(async () => {
    setErr("");
    try {
      const { data } = await getSupplierMyAuctions();
      setItems(data?.items || []);
    } catch (e) {
      setErr(parseApiError(e, "Failed to load your auctions"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <Stack spacing={1}>
        <LinearProgress />
        <Typography>Loading your auctions…</Typography>
      </Stack>
    );
  }

  if (err) {
    return <Alert severity="error">{err}</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h4">My bids</Typography>
        <Typography color="text.secondary">RFQs where you are participating, your rank, and live L1.</Typography>
      </Box>
      {items.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">You have not bid on any open RFQ yet. Browse the auction list to participate.</Typography>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>RFQ</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Opens</TableCell>
                <TableCell>Closes in</TableCell>
                <TableCell>My bid</TableCell>
                <TableCell>My rank</TableCell>
                <TableCell>L1</TableCell>
                <TableCell align="right">View</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => {
                const isActive = row.status === "active";
                const cd = isActive && row.current_close_time ? countDownTo(row.current_close_time)() : "—";
                if (isActive) void nowTick; // re-render countdown
                return (
                  <TableRow key={row.rfq_id}>
                    <TableCell>
                      {row.name}
                      <Typography variant="caption" display="block" color="text.secondary">
                        {row.reference_id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={row.status} />
                    </TableCell>
                    <TableCell>{row.bid_start_time ? formatShort(row.bid_start_time) : "—"}</TableCell>
                    <TableCell>{isActive ? <strong>{cd}</strong> : "—"}</TableCell>
                    <TableCell>₹{Number(row.my_total_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>L{row.my_rank}</TableCell>
                    <TableCell>
                      {row.l1_price != null
                        ? `₹${Number(row.l1_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </TableCell>
                    <TableCell align="right">
                      <Link to={`/auction/${row.rfq_id}`}>Open</Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
