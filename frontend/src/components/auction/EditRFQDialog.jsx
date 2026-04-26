import { useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { TRIGGER_LABELS, toLocalDateTimeInputValue } from "../../utils/auctionFormatters";

const BIDDER_VISIBILITY_OPTIONS = [
  { value: "full_rank", label: "Full rank visibility" },
  { value: "masked_competitor", label: "Masked competitors" },
];

export default function EditRFQDialog({ rfq, onClose, onSuccess }) {
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
    bidder_visibility_mode: rfq.bidder_visibility_mode || "full_rank",
    starting_price: String(rfq.starting_price ?? 0),
    minimum_decrement: String(rfq.minimum_decrement ?? 0),
    technical_specs_url: rfq.technical_specs_url || "",
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <Box component="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSuccess({
            ...form,
            bid_start_time: new Date(form.bid_start_time).toISOString(),
            bid_close_time: new Date(form.bid_close_time).toISOString(),
            forced_close_time: new Date(form.forced_close_time).toISOString(),
            pickup_date: new Date(form.pickup_date).toISOString(),
            trigger_window_minutes: Number(form.trigger_window_minutes),
            extension_duration_minutes: Number(form.extension_duration_minutes),
            starting_price: Number(form.starting_price),
            minimum_decrement: Number(form.minimum_decrement),
          });
        }}
      >
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
                Bid received extends on any bid, Rank change extends when bidder order changes, and L1 change extends only when lowest bidder changes.
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              select
              fullWidth
              label="Bidder Visibility Mode"
              value={form.bidder_visibility_mode}
              onChange={(e) => setForm((p) => ({ ...p, bidder_visibility_mode: e.target.value }))}
              helperText="Configure bidder identity visibility for RFQ Owner bid table/export."
            >
              {BIDDER_VISIBILITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="number" label="Starting Price (INR)" value={form.starting_price} onChange={(e) => setForm((p) => ({ ...p, starting_price: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth type="number" label="Minimum Decrement (INR)" value={form.minimum_decrement} onChange={(e) => setForm((p) => ({ ...p, minimum_decrement: e.target.value }))} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Technical Specs URL" value={form.technical_specs_url} onChange={(e) => setForm((p) => ({ ...p, technical_specs_url: e.target.value }))} /></Grid>
        </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">Save changes</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
