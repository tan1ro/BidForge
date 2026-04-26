import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";

import AuctionDetail from "./AuctionDetail";

vi.mock("../api", () => ({
  getRFQ: vi.fn(async () => ({
    data: {
      id: "rfq-1",
      name: "Sample Auction",
      reference_id: "RFQ-SAMPLE1",
      status: "active",
      bid_start_time: new Date(Date.now() - 10000).toISOString(),
      bid_close_time: new Date(Date.now() + 300000).toISOString(),
      current_close_time: new Date(Date.now() + 300000).toISOString(),
      forced_close_time: new Date(Date.now() + 600000).toISOString(),
      pickup_date: new Date(Date.now() + 86400000).toISOString(),
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      extension_trigger: "bid_received",
      total_bids: 1,
      lowest_bid: 1200,
      server_time: new Date().toISOString(),
    },
  })),
  getBids: vi.fn(async () => ({
    data: [
      {
        id: "b1",
        carrier_name: "Carrier A",
        freight_charges: 1000,
        origin_charges: 100,
        destination_charges: 100,
        total_price: 1200,
        transit_time: 2,
        validity: "7 days",
        rank: 1,
        created_at: new Date().toISOString(),
      },
    ],
  })),
  getActivity: vi.fn(async () => ({ data: [] })),
  submitBid: vi.fn(),
  updateRFQ: vi.fn(),
  pauseRFQ: vi.fn(),
  awardRFQ: vi.fn(),
  exportActivity: vi.fn(),
  getWebSocketBase: vi.fn(() => "ws://localhost:8000"),
}));

describe("AuctionDetail", () => {
  it("opens websocket with auth token subprotocol", async () => {
    const originalLocalStorage = global.localStorage;
    const socketInstances = [];
    const wsMock = vi.fn(function WebSocketMock(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = 1;
      this.close = vi.fn();
      socketInstances.push(this);
      setTimeout(() => this.onopen?.(), 0);
    });
    wsMock.OPEN = 1;
    global.WebSocket = wsMock;
    global.localStorage = { getItem: vi.fn(() => "jwt-token") };

    render(
      <MemoryRouter initialEntries={["/auction/rfq-1"]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail role="bidder" />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(socketInstances.length).toBeGreaterThan(0);
    });
    expect(socketInstances[0].url).toContain("/api/ws/rfqs/rfq-1");
    expect(socketInstances[0].protocols).toEqual(["token", "jwt-token"]);
    global.localStorage = originalLocalStorage;
  });

  it("renders auction title and bid table", async () => {
    render(
      <MemoryRouter initialEntries={["/auction/rfq-1"]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Sample Auction")).toBeInTheDocument();
      expect(screen.getAllByText("Carrier A").length).toBeGreaterThan(0);
    });
  });

  it("shows activity tab for bidder role", async () => {
    render(
      <MemoryRouter initialEntries={["/auction/rfq-1"]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail role="bidder" />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Activity \(/)).toBeInTheDocument();
    });
  });

  it("shows winner badge for terminal auction state", async () => {
    const { getRFQ } = await import("../api");
    getRFQ.mockResolvedValueOnce({
      data: {
        id: "rfq-1",
        name: "Closed Auction",
        reference_id: "RFQ-CLOSED1",
        status: "closed",
        bid_start_time: new Date(Date.now() - 10000).toISOString(),
        bid_close_time: new Date(Date.now() - 5000).toISOString(),
        current_close_time: new Date(Date.now() - 5000).toISOString(),
        forced_close_time: new Date(Date.now() + 600000).toISOString(),
        pickup_date: new Date(Date.now() + 86400000).toISOString(),
        trigger_window_minutes: 10,
        extension_duration_minutes: 5,
        extension_trigger: "bid_received",
        total_bids: 1,
        lowest_bid: 1200,
        winner_carrier: "Carrier A",
        winning_bid_total: 1200,
      },
    });

    render(
      <MemoryRouter initialEntries={["/auction/rfq-1"]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail role="rfqowner" />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Winner: Carrier A/)).toBeInTheDocument();
      expect(screen.getByText("Winner")).toBeInTheDocument();
    });
  });

  it("shows award winner action for rfqowner on closed auction", async () => {
    const { getRFQ } = await import("../api");
    getRFQ.mockResolvedValueOnce({
      data: {
        id: "rfq-1",
        name: "Closed Auction",
        reference_id: "RFQ-CLOSED1",
        status: "closed",
        bid_start_time: new Date(Date.now() - 10000).toISOString(),
        bid_close_time: new Date(Date.now() - 5000).toISOString(),
        current_close_time: new Date(Date.now() - 5000).toISOString(),
        forced_close_time: new Date(Date.now() + 600000).toISOString(),
        pickup_date: new Date(Date.now() + 86400000).toISOString(),
        trigger_window_minutes: 10,
        extension_duration_minutes: 5,
        extension_trigger: "bid_received",
        total_bids: 1,
        lowest_bid: 1200,
      },
    });

    render(
      <MemoryRouter initialEntries={["/auction/rfq-1"]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail role="rfqowner" />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Award Winner")).toBeInTheDocument();
    });
  });
});
