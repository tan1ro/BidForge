import { useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { formatCurrency } from "../../utils/auctionFormatters";

export default function AwardWinnerDialog({ bids, onClose, onSubmit }) {
  const [bidId, setBidId] = useState(bids[0]?.id || "");
  const [awardNote, setAwardNote] = useState("");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Award winner</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select
            label="Winning bid"
            value={bidId}
            onChange={(e) => setBidId(e.target.value)}
            fullWidth
            helperText="Select the bid to be marked as winner"
          >
            {bids.map((bid) => (
              <MenuItem key={bid.id} value={bid.id}>
                {`L${bid.rank} - ${bid.carrier_name} - ${formatCurrency(bid.total_price)}`}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Award note (optional)"
            value={awardNote}
            onChange={(e) => setAwardNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!bidId} onClick={() => onSubmit({ bidId, awardNote })}>
          Confirm award
        </Button>
      </DialogActions>
    </Dialog>
  );
}
