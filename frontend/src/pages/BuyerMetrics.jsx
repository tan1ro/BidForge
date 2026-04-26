import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import {
  getAvgBidsMetrics,
  getBidsPerRFQMetrics,
  getExtensionsPerRFQMetrics,
  getWinningPriceTrendMetrics,
} from "../api";
import { parseApiError } from "../utils/errorHandling";

function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function BuyerMetrics() {
  const [period, setPeriod] = useState("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bidsPerRFQ, setBidsPerRFQ] = useState([]);
  const [avgBids, setAvgBids] = useState([]);
  const [winningTrend, setWinningTrend] = useState([]);
  const [extensionsPerRFQ, setExtensionsPerRFQ] = useState([]);

  useEffect(() => {
    async function loadMetrics() {
      setLoading(true);
      setError("");
      try {
        const [bidsRes, avgRes, trendRes, extRes] = await Promise.all([
          getBidsPerRFQMetrics(),
          getAvgBidsMetrics({ period }),
          getWinningPriceTrendMetrics({ period }),
          getExtensionsPerRFQMetrics(),
        ]);
        setBidsPerRFQ(bidsRes.data?.items || []);
        setAvgBids(avgRes.data?.items || []);
        setWinningTrend(trendRes.data?.items || []);
        setExtensionsPerRFQ(extRes.data?.items || []);
      } catch (err) {
        setError(parseApiError(err, "Failed to load success metrics"));
      } finally {
        setLoading(false);
      }
    }
    void loadMetrics();
  }, [period]);

  const kpis = useMemo(() => {
    const totalRFQs = bidsPerRFQ.length;
    const totalBids = bidsPerRFQ.reduce((sum, row) => sum + Number(row.bids_count || 0), 0);
    const avgBidsOverall = totalRFQs ? (totalBids / totalRFQs).toFixed(2) : "0.00";
    const totalExtensions = extensionsPerRFQ.reduce((sum, row) => sum + Number(row.extension_count || 0), 0);
    const avgWinning = winningTrend.length
      ? (
          winningTrend.reduce((sum, row) => sum + Number(row.avg_winning_price || 0), 0) /
          winningTrend.length
        ).toFixed(2)
      : "0.00";
    return { totalRFQs, avgBidsOverall, totalExtensions, avgWinning };
  }, [bidsPerRFQ, extensionsPerRFQ, winningTrend]);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">Success Metrics</Typography>
        <Typography color="text.secondary">Buyer analytics for bids, extensions, and winning-price trends</Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }}>
        <TextField
          select
          label="Time Period"
          size="small"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="day">Daily</MenuItem>
          <MenuItem value="week">Weekly</MenuItem>
          <MenuItem value="month">Monthly</MenuItem>
        </TextField>
        {loading && <Typography color="text.secondary">Loading metrics...</Typography>}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Tracked RFQs</Typography><Typography variant="h5">{kpis.totalRFQs}</Typography></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Avg Bids / RFQ</Typography><Typography variant="h5">{kpis.avgBidsOverall}</Typography></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Total Extensions</Typography><Typography variant="h5">{kpis.totalExtensions}</Typography></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card><CardContent><Typography color="text.secondary" variant="body2">Avg Winning Price</Typography><Typography variant="h5">{formatCurrency(kpis.avgWinning)}</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Average Bids by Auction Type & Period</Typography>
              {avgBids.length === 0 ? (
                <Typography color="text.secondary">No data available.</Typography>
              ) : (
                avgBids.slice(0, 8).map((row) => (
                  <Typography key={`${row.auction_type}-${row.period_bucket}`} variant="body2" sx={{ mb: 0.6 }}>
                    {row.period_bucket} - {row.auction_type}: {row.avg_bids} avg bids ({row.bids_count} bids / {row.rfq_count} RFQs)
                  </Typography>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Winning Price Trend</Typography>
              {winningTrend.length === 0 ? (
                <Typography color="text.secondary">No closed RFQs available.</Typography>
              ) : (
                winningTrend.slice(0, 8).map((row) => (
                  <Typography key={row.period_bucket} variant="body2" sx={{ mb: 0.6 }}>
                    {row.period_bucket}: avg {formatCurrency(row.avg_winning_price)} (min {formatCurrency(row.min_winning_price)}, max {formatCurrency(row.max_winning_price)})
                  </Typography>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
