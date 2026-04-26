import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import AutoGraphOutlinedIcon from "@mui/icons-material/AutoGraphOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import TrackChangesOutlinedIcon from "@mui/icons-material/TrackChangesOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import GavelOutlinedIcon from "@mui/icons-material/GavelOutlined";
import PriceChangeOutlinedIcon from "@mui/icons-material/PriceChangeOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import MilitaryTechOutlinedIcon from "@mui/icons-material/MilitaryTechOutlined";
import Looks3OutlinedIcon from "@mui/icons-material/Looks3Outlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import TipsAndUpdatesOutlinedIcon from "@mui/icons-material/TipsAndUpdatesOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import PsychologyAltOutlinedIcon from "@mui/icons-material/PsychologyAltOutlined";
import { getDashboardRecommendations, getBidderMyAuctions, listRFQs } from "../api";
import { parseApiError } from "../utils/errorHandling";

function formatCurrency(val) {
  if (val == null) return "—";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function formatPercent(val) {
  if (!Number.isFinite(val)) return "0%";
  return `${val.toFixed(1)}%`;
}

function countdownTo(target) {
  if (!target) return "—";
  const end = new Date(target).getTime();
  const delta = end - Date.now();
  if (delta <= 0) return "Closed";
  const s = Math.floor(delta / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function MetricCard({ icon, label, value }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", color: "primary.contrastText" }}>
            {icon}
          </Avatar>
          <Box>
            <Typography color="text.secondary">{label}</Typography>
            <Typography variant="h5">{value}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function InsightRow({ icon, text }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Avatar sx={{ width: 24, height: 24, bgcolor: "action.hover", color: "text.secondary" }}>
        {icon}
      </Avatar>
      <Typography variant="body2">{text}</Typography>
    </Stack>
  );
}

export default function Dashboard({ role }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [rfqownerRfqs, setrfqownerRfqs] = useState([]);
  const [bidderRows, setBidderRows] = useState([]);
  const [aiRecommendations, setAiRecommendations] = useState([]);
  const [aiSource, setAiSource] = useState("fallback");

  useEffect(() => {
    const id = setInterval(() => setClockMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (role === "rfqowner") {
          const { data } = await listRFQs({ page: 1, page_size: 100 });
          setrfqownerRfqs(data?.items || []);
        } else {
          const { data } = await getBidderMyAuctions();
          setBidderRows(data?.items || []);
        }
      } catch (err) {
        setError(parseApiError(err, "Failed to load dashboard"));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [role]);

  const rfqownerStats = useMemo(() => {
    const total = rfqownerRfqs.length;
    const active = rfqownerRfqs.filter((r) => r.status === "active").length;
    const upcoming = rfqownerRfqs.filter((r) => r.status === "upcoming").length;
    const closed = rfqownerRfqs.filter((r) => r.status === "closed" || r.status === "force_closed").length;
    const totalBids = rfqownerRfqs.reduce((sum, r) => sum + Number(r.total_bids || 0), 0);
    const avgBidsPerAuction = total > 0 ? totalBids / total : 0;
    const avgBidsPerActiveAuction = active > 0
      ? rfqownerRfqs
          .filter((r) => r.status === "active")
          .reduce((sum, r) => sum + Number(r.total_bids || 0), 0) / active
      : 0;
    const noBidActiveAuctions = rfqownerRfqs.filter((r) => r.status === "active" && Number(r.total_bids || 0) === 0);
    const closeInNextHour = rfqownerRfqs.filter((r) => {
      if (r.status !== "active") return false;
      const ms = new Date(r.current_close_time).getTime() - clockMs;
      return ms > 0 && ms <= 60 * 60 * 1000;
    }).length;
    const forceClosed = rfqownerRfqs.filter((r) => r.status === "force_closed").length;
    const forceCloseRate = closed > 0 ? (forceClosed / closed) * 100 : 0;
    const activeSorted = [...rfqownerRfqs]
      .filter((r) => r.status === "active")
      .sort((a, b) => new Date(a.current_close_time) - new Date(b.current_close_time));
    const bestCompetitionAuction = [...rfqownerRfqs]
      .sort((a, b) => Number(b.total_bids || 0) - Number(a.total_bids || 0))[0] || null;
    return {
      total,
      active,
      upcoming,
      closed,
      totalBids,
      avgBidsPerAuction,
      avgBidsPerActiveAuction,
      noBidActiveAuctions,
      closeInNextHour,
      forceCloseRate,
      activeSorted,
      bestCompetitionAuction,
    };
  }, [rfqownerRfqs, clockMs]);

  const bidderStats = useMemo(() => {
    const total = bidderRows.length;
    const active = bidderRows.filter((r) => r.status === "active").length;
    const winning = bidderRows.filter((r) => Number(r.my_rank) === 1).length;
    const top3 = bidderRows.filter((r) => Number(r.my_rank) <= 3).length;
    const top3Rate = total > 0 ? (top3 / total) * 100 : 0;
    const winRate = total > 0 ? (winning / total) * 100 : 0;
    const activeNearClose = bidderRows.filter((r) => {
      if (r.status !== "active") return false;
      const ms = new Date(r.current_close_time).getTime() - clockMs;
      return ms > 0 && ms <= 60 * 60 * 1000;
    });
    const atRisk = activeNearClose.filter((r) => Number(r.my_rank) > 3);
    const avgRank =
      total > 0
        ? (
            bidderRows.reduce((sum, r) => sum + Number(r.my_rank || 0), 0) /
            Math.max(1, total)
          ).toFixed(2)
        : "—";
    const activeSorted = [...bidderRows]
      .filter((r) => r.status === "active")
      .sort((a, b) => new Date(a.current_close_time) - new Date(b.current_close_time));
    const strongestPosition = [...bidderRows]
      .filter((r) => Number(r.my_rank) === 1 && r.l1_price != null)
      .sort((a, b) => Number(a.l1_price || 0) - Number(b.l1_price || 0))[0] || null;
    return {
      total,
      active,
      winning,
      top3,
      top3Rate,
      winRate,
      avgRank,
      activeNearClose,
      atRisk,
      activeSorted,
      strongestPosition,
    };
  }, [bidderRows, clockMs]);

  const recommendationSummary = useMemo(() => {
    if (role === "rfqowner") {
      return {
        totalRFQs: rfqownerStats.total,
        activeRFQs: rfqownerStats.active,
        upcomingRFQs: rfqownerStats.upcoming,
        closedRFQs: rfqownerStats.closed,
        avgBidsPerAuction: Number(rfqownerStats.avgBidsPerAuction.toFixed(2)),
        avgBidsPerActiveAuction: Number(rfqownerStats.avgBidsPerActiveAuction.toFixed(2)),
        activeCloseInNextHour: rfqownerStats.closeInNextHour,
        activeWithZeroBids: rfqownerStats.noBidActiveAuctions.length,
        forceCloseRatePct: Number(rfqownerStats.forceCloseRate.toFixed(1)),
      };
    }
    return {
      participatedAuctions: bidderStats.total,
      activeAuctions: bidderStats.active,
      l1WinRatePct: Number(bidderStats.winRate.toFixed(1)),
      top3RatePct: Number(bidderStats.top3Rate.toFixed(1)),
      averageRank: bidderStats.avgRank,
      activeCloseInNextHour: bidderStats.activeNearClose.length,
      atRiskAuctions: bidderStats.atRisk.length,
      currentL1Count: bidderStats.winning,
    };
  }, [role, rfqownerStats, bidderStats]);

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const { data } = await getDashboardRecommendations({ summary: recommendationSummary });
        setAiRecommendations(Array.isArray(data?.items) ? data.items.slice(0, 3) : []);
        setAiSource(data?.source || "fallback");
      } catch {
        setAiRecommendations([]);
        setAiSource("fallback");
      }
    }
    if (loading || error) return;
    void loadRecommendations();
  }, [loading, error, recommendationSummary]);

  return (
    <Stack spacing={2.5}>
      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box>
              <Typography variant="h4">{role === "rfqowner" ? "RFQ Owner Dashboard" : "Bidder Dashboard"}</Typography>
              <Typography color="text.secondary">
                {role === "rfqowner"
                  ? "Track active auctions, bids, and upcoming actions."
                  : "Monitor your bids, rankings, and auctions requiring immediate attention."}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip icon={<AutoGraphOutlinedIcon />} label="Live insights" color="primary" variant="outlined" />
              <Chip icon={<TrackChangesOutlinedIcon />} label="Actionable signals" color="secondary" variant="outlined" />
              <Chip icon={<BoltOutlinedIcon />} label="Fast decision support" color="warning" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Typography color="text.secondary">Loading dashboard...</Typography>}

      {!loading && role === "rfqowner" && (
        <>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<Inventory2OutlinedIcon fontSize="small" />} label="Total RFQs" value={rfqownerStats.total} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<GavelOutlinedIcon fontSize="small" />} label="Active" value={rfqownerStats.active} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<PriceChangeOutlinedIcon fontSize="small" />} label="Avg bids / auction" value={rfqownerStats.avgBidsPerAuction.toFixed(2)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<ReportProblemOutlinedIcon fontSize="small" />} label="Force-close rate" value={formatPercent(rfqownerStats.forceCloseRate)} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Insights Snapshot</Typography>
                  <Stack spacing={1}>
                    <InsightRow
                      icon={<AccessTimeOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Active auctions closing in next hour: <strong>{rfqownerStats.closeInNextHour}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<ReportProblemOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Active auctions with zero bids: <strong>{rfqownerStats.noBidActiveAuctions.length}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<TrendingUpOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Avg bids on active auctions: <strong>{rfqownerStats.avgBidsPerActiveAuction.toFixed(2)}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<Inventory2OutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Upcoming auctions: <strong>{rfqownerStats.upcoming}</strong>, closed auctions:{" "}
                          <strong>{rfqownerStats.closed}</strong>
                        </>
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Recommended Actions</Typography>
                  <Chip
                    size="small"
                    icon={<PsychologyAltOutlinedIcon fontSize="small" />}
                    label={aiSource === "ai" ? "AI generated (Gemini)" : "Rules fallback"}
                    color={aiSource === "ai" ? "primary" : "default"}
                    sx={{ mb: 1 }}
                  />
                  <Stack spacing={1}>
                    {(aiRecommendations.length ? aiRecommendations : [
                      rfqownerStats.noBidActiveAuctions.length > 0
                        ? "Follow up on active auctions with zero bids; these are likely under-participated."
                        : "Participation is healthy across active auctions.",
                      rfqownerStats.closeInNextHour > 0
                        ? "Review auctions closing soon to avoid last-minute surprises and extension pressure."
                        : "No immediate close-time pressure right now.",
                      rfqownerStats.bestCompetitionAuction
                        ? `Highest competition is in ${rfqownerStats.bestCompetitionAuction.reference_id} (${rfqownerStats.bestCompetitionAuction.total_bids} bids).`
                        : "No auction competition signal available yet.",
                    ]).map((item, idx) => (
                      <InsightRow key={idx} icon={<TipsAndUpdatesOutlinedIcon fontSize="small" />} text={item} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                <Typography variant="h6">Active auctions closing soon</Typography>
                <Stack direction="row" spacing={1}>
                  <Button component={RouterLink} to="/metrics" size="small" variant="outlined">Detailed metrics</Button>
                  <Button component={RouterLink} to="/auctions" size="small" variant="outlined">Open auctions</Button>
                </Stack>
              </Stack>
              <Stack spacing={1.2} sx={{ mt: 1.5 }}>
                {rfqownerStats.activeSorted.length === 0 ? (
                  <Typography color="text.secondary">No active auctions right now.</Typography>
                ) : (
                  rfqownerStats.activeSorted.slice(0, 6).map((row) => (
                    <Stack key={row.id} direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">{row.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.reference_id} • {row.total_bids || 0} bids
                        </Typography>
                      </Box>
                      <Chip label={countdownTo(row.current_close_time)} color="warning" size="small" />
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && role === "bidder" && (
        <>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<Inventory2OutlinedIcon fontSize="small" />} label="Participated auctions" value={bidderStats.total} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<GavelOutlinedIcon fontSize="small" />} label="Active bids" value={bidderStats.active} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<MilitaryTechOutlinedIcon fontSize="small" />} label="Win rate (L1)" value={formatPercent(bidderStats.winRate)} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <MetricCard icon={<Looks3OutlinedIcon fontSize="small" />} label="Top-3 rate" value={formatPercent(bidderStats.top3Rate)} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Insights Snapshot</Typography>
                  <Stack spacing={1}>
                    <InsightRow
                      icon={<MilitaryTechOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Current L1 auctions: <strong>{bidderStats.winning}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<TrendingUpOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Average rank: <strong>{bidderStats.avgRank}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<AccessTimeOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          Active auctions closing in next hour: <strong>{bidderStats.activeNearClose.length}</strong>
                        </>
                      }
                    />
                    <InsightRow
                      icon={<ReportProblemOutlinedIcon fontSize="small" />}
                      text={
                        <>
                          High-risk closes (rank &gt; 3): <strong>{bidderStats.atRisk.length}</strong>
                        </>
                      }
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>Recommended Actions</Typography>
                  <Chip
                    size="small"
                    icon={<PsychologyAltOutlinedIcon fontSize="small" />}
                    label={aiSource === "ai" ? "AI generated (Gemini)" : "Rules fallback"}
                    color={aiSource === "ai" ? "primary" : "default"}
                    sx={{ mb: 1 }}
                  />
                  <Stack spacing={1}>
                    {(aiRecommendations.length ? aiRecommendations : [
                      bidderStats.atRisk.length > 0
                        ? "Prioritize auctions closing within one hour where your rank is below top-3."
                        : "No urgent high-risk auctions right now.",
                      bidderStats.top3Rate < 50
                        ? "Your top-3 conversion is below 50%; consider tighter bid increments on competitive lanes."
                        : "Top-3 positioning is healthy; focus on converting top-3 into L1.",
                      bidderStats.strongestPosition
                        ? `Strongest position: ${bidderStats.strongestPosition.reference_id} (L1 at ${formatCurrency(
                            bidderStats.strongestPosition.l1_price
                          )}).`
                        : "No dominant L1 position identified yet.",
                    ]).map((item, idx) => (
                      <InsightRow key={idx} icon={<TipsAndUpdatesOutlinedIcon fontSize="small" />} text={item} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                <Typography variant="h6">Closest active auctions</Typography>
                <Button component={RouterLink} to="/my-bids" size="small" variant="outlined">Open my bids</Button>
              </Stack>
              <Stack spacing={1.2} sx={{ mt: 1.5 }}>
                {bidderStats.activeSorted.length === 0 ? (
                  <Typography color="text.secondary">No active bids yet.</Typography>
                ) : (
                  bidderStats.activeSorted.slice(0, 6).map((row) => (
                    <Stack key={row.rfq_id} direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">{row.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Rank L{row.my_rank} • My bid {formatCurrency(row.my_total_price)}
                        </Typography>
                      </Box>
                      <Chip label={countdownTo(row.current_close_time)} color="warning" size="small" />
                    </Stack>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
