import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import RFQList from "./RFQList";

vi.mock("../api", () => ({
  listRFQs: vi.fn(async () => ({
    data: [
      {
        id: "rfq-1",
        name: "Mumbai to Delhi",
        reference_id: "RFQ-ABC12345",
        status: "active",
        lowest_bid: 1200,
        total_bids: 2,
        current_close_time: new Date().toISOString(),
        forced_close_time: new Date(Date.now() + 3600000).toISOString(),
        created_at: new Date().toISOString(),
      },
    ],
  })),
  deleteRFQ: vi.fn(),
}));

describe("RFQList", () => {
  it("renders auction data from API", async () => {
    render(
      <MemoryRouter>
        <RFQList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Mumbai to Delhi")).toBeInTheDocument();
      expect(screen.getByText("RFQ-ABC12345")).toBeInTheDocument();
    });
  });
});
