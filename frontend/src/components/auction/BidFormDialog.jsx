import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { submitBid } from "../../api";
import { parseApiError } from "../../utils/errorHandling";
import { formatCurrency } from "../../utils/auctionFormatters";

export default function BidFormDialog({ rfq, rfqId, onClose, onSuccess, onError }) {
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
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isFinite(transitDays) ||
    transitDays < 1;

  const l1 =
    rfq?.lowest_bid != null && rfq.lowest_bid !== ""
      ? Number(rfq.lowest_bid)
      : Number(rfq?.starting_price || 0);
  const minDec = Number(rfq?.minimum_decrement || 0);
  const maxBeat =
    minDec > 0 && l1 > 0 ? Math.round((l1 - minDec) * 100) / 100 : null;

  function handleChange(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
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
            {rfq && (
              <Alert severity="info">
                Current L1 (lowest total): {formatCurrency(rfq.lowest_bid != null ? rfq.lowest_bid : null)}
                {rfq.lowest_bid == null && Number(rfq.starting_price) > 0 && (
                  <> (no bid yet; starting price {formatCurrency(rfq.starting_price)})</>
                )}
                {maxBeat != null && <span> — To beat the minimum decrement, your total must be at most {formatCurrency(maxBeat)}.</span>}
              </Alert>
            )}
            <TextField
              label="Display name (optional)"
              value={form.carrier_name}
              onChange={(e) => handleChange("carrier_name", e.target.value)}
              fullWidth
              autoComplete="organization"
              placeholder="Leave blank to use your account name"
              helperText="How your company name appears to the RFQ Owner. Leave blank to use your account name."
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
