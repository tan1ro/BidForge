import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAvgBidsMetrics,
  getBidsPerRFQMetrics,
  getExtensionImpactMetrics,
  getExtensionsPerRFQMetrics,
  getWinningPriceTrendMetrics,
} from "../api";
import { parseApiError } from "../utils/errorHandling";

function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

const METRICS_PAGE_SIZE = 20;

export default function RfqownerMetrics() {
  const [period, setPeriod] = useState("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bidsPage, setBidsPage] = useState(1);
  const [extPage, setExtPage] = useState(1);
  const [searchBids, setSearchBids] = useState("");
  const [searchExt, setSearchExt] = useState("");
  const [bidsPerRFQ, setBidsPerRFQ] = useState([]);
  const [bidsPerTotal, setBidsPerTotal] = useState(0);
  const [avgBids, setAvgBids] = useState([]);
  const [winningTrend, setWinningTrend] = useState([]);
  const [extensionsPerRFQ, setExtensionsPerRFQ] = useState([]);
  const [extPerTotal, setExtPerTotal] = useState(0);
  const [extensionImpact, setExtensionImpact] = useState([]);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [bidsRes, avgRes, trendRes, extRes, impactRes] = await Promise.all([
        getBidsPerRFQMetrics({
          page: bidsPage,
          page_size: METRICS_PAGE_SIZE,
          search: searchBids || undefined,
        }),
        getAvgBidsMetrics({ period }),
        getWinningPriceTrendMetrics({ period }),
        getExtensionsPerRFQMetrics({
          page: extPage,
          page_size: METRICS_PAGE_SIZE,
          search: searchExt || undefined,
        }),
        getExtensionImpactMetrics({ period }),
      ]);
      setBidsPerRFQ(bidsRes.data?.items || []);
      setBidsPerTotal(bidsRes.data?.total ?? 0);
      setAvgBids(avgRes.data?.items || []);
      setWinningTrend(trendRes.data?.items || []);
      setExtensionsPerRFQ(extRes.data?.items || []);
      setExtPerTotal(extRes.data?.total ?? 0);
      setExtensionImpact(impactRes.data?.items || []);
    } catch (err) {
      setError(parseApiError(err, "Failed to load success metrics"));
    } finally {
      setLoading(false);
    }
  }, [period, bidsPage, extPage, searchBids, searchExt]);

  useEffect(() => {
    const id = setTimeout(() => {
      void loadMetrics();
    }, 0);
    return () => clearTimeout(id);
  }, [loadMetrics]);

  const winChartData = useMemo(
    () =>
      (winningTrend || []).map((row) => ({
        name: row.period_bucket,
        avg: Number(row.avg_winning_price) || 0,
        min: Number(row.min_winning_price) || 0,
        max: Number(row.max_winning_price) || 0,
      })),
    [winningTrend]
  );

  const bidsPerBar = useMemo(
    () =>
      (bidsPerRFQ || []).map((row) => ({
        name: (row.name || row.reference_id || "RFQ").slice(0, 18),
        bids: Number(row.bids_count) || 0,
      })),
    [bidsPerRFQ]
  );

  const extImpactBar = useMemo(
    () =>
      (extensionImpact || []).map((row) => ({
        name: String(row.period_bucket),
        ext: Number(row.avg_improvement_extended) || 0,
        non: Number(row.avg_improvement_non_extended) || 0,
      })),
    [extensionImpact]
  );

  const kpis = useMemo(() => {
    const totalRFQs = bidsPerTotal;
    const totalBids = bidsPerRFQ.reduce((sum, row) => sum + Number(row.bids_count || 0), 0);
    const avgBidsOverall = bidsPerRFQ.length ? (totalBids / Math.max(1, bidsPerRFQ.length)).toFixed(2) : "0.00";
    const totalExtensions = extensionsPerRFQ.reduce((sum, row) => sum + Number(row.extension_count || 0), 0);
    const avgWinning = winningTrend.length
      ? (
          winningTrend.reduce((sum, row) => sum + Number(row.avg_winning_price || 0), 0) /
          winningTrend.length
        ).toFixed(2)
      : "0.00";
    const extCount = extensionImpact.reduce((sum, row) => sum + Number(row.extended_count || 0), 0);
    const nonExtCount = extensionImpact.reduce((sum, row) => sum + Number(row.non_extended_count || 0), 0);
    const extWeighted = extensionImpact.reduce(
      (sum, row) => sum + Number(row.avg_improvement_extended || 0) * Number(row.extended_count || 0),
      0
    );
    const nonExtWeighted = extensionImpact.reduce(
      (sum, row) => sum + Number(row.avg_improvement_non_extended || 0) * Number(row.non_extended_count || 0),
      0
    );
    const extendedAvgImprovement = extCount ? extWeighted / extCount : 0;
    const nonExtendedAvgImprovement = nonExtCount ? nonExtWeighted / nonExtCount : 0;
    const netUplift = extendedAvgImprovement - nonExtendedAvgImprovement;
    return {
      totalRFQs,
      avgBidsOverall,
      totalExtensions,
      avgWinning,
      extendedAvgImprovement,
      nonExtendedAvgImprovement,
      netUplift,
    };
  }, [bidsPerRFQ, bidsPerTotal, extensionsPerRFQ, winningTrend, extensionImpact]);

  const extTotalPages = Math.max(1, Math.ceil((extPerTotal || 0) / METRICS_PAGE_SIZE));
  const bidTotalPages = Math.max(1, Math.ceil((bidsPerTotal || 0) / METRICS_PAGE_SIZE));

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4">Success Metrics</Typography>
        <Typography color="text.secondary">RFQ Owner analytics: charts and tables (paginated)</Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "flex-start", sm: "center" }} flexWrap="wrap">
        <TextField
          select
          label="Time Period"
          size="small"
          value={period}
          onChange={(event) => {
            setPeriod(event.target.value);
            setBidsPage(1);
            setExtPage(1);
          }}
          sx={{ minWidth: 160, width: { xs: "100%", sm: "auto" } }}
        >
          <MenuItem value="day">Daily</MenuItem>
          <MenuItem value="week">Weekly</MenuItem>
          <MenuItem value="month">Monthly</MenuItem>
        </TextField>
        {loading && <Typography color="text.secondary">Loading…</Typography>}
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Tracked RFQs (page)</Typography>
              <Typography variant="h5">{kpis.totalRFQs}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Avg Bids (this page)</Typography>
              <Typography variant="h5">{kpis.avgBidsOverall}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Total extensions (this page)</Typography>
              <Typography variant="h5">{kpis.totalExtensions}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Avg winning price</Typography>
              <Typography variant="h5">{formatCurrency(kpis.avgWinning)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Extended avg improvement</Typography>
              <Typography variant="h5">{formatCurrency(kpis.extendedAvgImprovement)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Non-extended avg improvement</Typography>
              <Typography variant="h5">{formatCurrency(kpis.nonExtendedAvgImprovement)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" variant="body2">Net uplift (extensions)</Typography>
              <Typography variant="h5">{formatCurrency(kpis.netUplift)}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ minHeight: 360 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Winning price trend</Typography>
              {winChartData.length === 0 ? (
                <Typography color="text.secondary">No closed RFQs in this view.</Typography>
              ) : (
                <Box sx={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={winChartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => formatCurrency(v)} labelFormatter={(l) => `Period: ${l}`} />
                      <Line type="monotone" dataKey="avg" name="Avg" stroke="#1976d2" dot />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ minHeight: 360 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Bids per RFQ</Typography>
              {bidsPerBar.length === 0 ? (
                <Typography color="text.secondary">No data.</Typography>
              ) : (
                <Box sx={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={bidsPerBar} margin={{ top: 8, right: 8, bottom: 32, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-20} textAnchor="end" height={48} fontSize={10} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="bids" fill="#2e7d32" name="Bids" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card sx={{ minHeight: 320 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Extension impact: extended vs not (by period)</Typography>
              {extImpactBar.length === 0 ? (
                <Typography color="text.secondary">No data.</Typography>
              ) : (
                <Box sx={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={extImpactBar}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" fontSize={11} />
                      <YAxis tickFormatter={(v) => `₹${v}`} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Bar dataKey="ext" name="Extended" fill="#ed6c02" />
                      <Bar dataKey="non" name="Not extended" fill="#9e9e9e" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Average bids by type &amp; period</Typography>
              {avgBids.length === 0 ? (
                <Typography color="text.secondary">No data.</Typography>
              ) : (
                <Stack spacing={0.6}>
                  {avgBids.map((row) => (
                    <Typography key={`${row.auction_type}-${row.period_bucket}`} variant="body2">
                      {row.period_bucket} — {row.auction_type}: {row.avg_bids} avg ({row.bids_count} bids / {row.rfq_count} RFQs)
                    </Typography>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
            <TextField
              size="small"
              label="Search RFQs (bids table)"
              value={searchBids}
              fullWidth
              onChange={(e) => {
                setSearchBids(e.target.value);
                setBidsPage(1);
              }}
            />
            <Pagination
              count={bidTotalPages}
              page={bidsPage}
              onChange={(_, p) => setBidsPage(p)}
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              Total: {bidsPerTotal} RFQs
            </Typography>
          </Stack>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Bids per RFQ</Typography>
          {bidsPerRFQ.length === 0 ? (
            <Typography color="text.secondary">No rows on this page.</Typography>
          ) : (
            bidsPerRFQ.map((row) => (
              <Typography key={row.rfq_id || row.id} variant="body2" sx={{ mb: 0.4 }}>
                {row.reference_id} — {row.name}: {row.bids_count} bids
              </Typography>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
            <TextField
              size="small"
              label="Search RFQs (extensions table)"
              value={searchExt}
              fullWidth
              onChange={(e) => {
                setSearchExt(e.target.value);
                setExtPage(1);
              }}
            />
            <Pagination
              count={extTotalPages}
              page={extPage}
              onChange={(_, p) => setExtPage(p)}
              size="small"
            />
            <Typography variant="caption" color="text.secondary">Total: {extPerTotal}</Typography>
          </Stack>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Extensions per RFQ</Typography>
          {extensionsPerRFQ.length === 0 ? (
            <Typography color="text.secondary">No rows on this page.</Typography>
          ) : (
            extensionsPerRFQ.map((row) => (
              <Typography key={row.rfq_id} variant="body2" sx={{ mb: 0.4 }}>
                {row.reference_id} — {row.name}: {row.extension_count} extension(s)
              </Typography>
            ))
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
