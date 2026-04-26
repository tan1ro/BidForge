import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import BuyerMetrics from "./BuyerMetrics";

vi.mock("../api", () => ({
  getBidsPerRFQMetrics: vi.fn(async () => ({
    data: {
      items: [{ rfq_id: "rfq-1", bids_count: 4, status: "closed", name: "Lane A", reference_id: "RFQ-1" }],
    },
  })),
  getAvgBidsMetrics: vi.fn(async () => ({
    data: {
      items: [{ auction_type: "Reverse Auction (lowest wins)", period_bucket: "2026-04-26", rfq_count: 1, bids_count: 4, avg_bids: 4 }],
    },
  })),
  getWinningPriceTrendMetrics: vi.fn(async () => ({
    data: {
      items: [{ period_bucket: "2026-04-26", avg_winning_price: 1200, min_winning_price: 1200, max_winning_price: 1200 }],
    },
  })),
  getExtensionsPerRFQMetrics: vi.fn(async () => ({
    data: {
      items: [{ rfq_id: "rfq-1", extension_count: 2 }],
    },
  })),
}));

describe("BuyerMetrics", () => {
  it("renders success metrics cards and sections", async () => {
    render(<BuyerMetrics />);

    await waitFor(() => {
      expect(screen.getByText("Success Metrics")).toBeInTheDocument();
      expect(screen.getByText("Tracked RFQs")).toBeInTheDocument();
      expect(screen.getByText("Average Bids by Auction Type & Period")).toBeInTheDocument();
      expect(screen.getByText("Winning Price Trend")).toBeInTheDocument();
    });
  });
});
