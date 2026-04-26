import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import RfqownerMetrics from "./BuyerMetrics";

vi.mock("../api", () => ({
  getBidsPerRFQMetrics: vi.fn(async () => ({
    data: {
      items: [{ rfq_id: "rfq-1", bids_count: 4, status: "closed", name: "Lane A", reference_id: "RFQ-1" }],
      total: 1,
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
      total: 1,
    },
  })),
  getExtensionImpactMetrics: vi.fn(async () => ({
    data: {
      items: [
        {
          period_bucket: "2026-04-26",
          extended_count: 1,
          non_extended_count: 1,
          avg_improvement_extended: 200,
          avg_improvement_non_extended: 100,
          delta_absolute: 100,
          delta_percent: 100,
        },
      ],
    },
  })),
}));

describe("RfqownerMetrics", () => {
  it("renders success metrics cards and sections", async () => {
    render(<RfqownerMetrics />);

    await waitFor(() => {
      expect(screen.getByText("Success Metrics")).toBeInTheDocument();
      expect(screen.getByText("Tracked RFQs (page)")).toBeInTheDocument();
      expect(screen.getByText("Average bids by type & period")).toBeInTheDocument();
      expect(screen.getByText("Winning price trend")).toBeInTheDocument();
      expect(screen.getByText("Extended avg improvement")).toBeInTheDocument();
      expect(screen.getByText("Non-extended avg improvement")).toBeInTheDocument();
      expect(screen.getByText("Net uplift (extensions)")).toBeInTheDocument();
    });
  });
});
