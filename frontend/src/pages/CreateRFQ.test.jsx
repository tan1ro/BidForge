import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import CreateRFQ from "./CreateRFQ";

const mockedNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock("../api", () => ({
  createRFQ: vi.fn(async () => ({ data: { id: "rfq-1", reference_id: "RFQ-NEW1234" } })),
}));

function toInputDate(minutesFromNow) {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

describe("CreateRFQ", () => {
  it("submits quote submission reference fields with RFQ payload", async () => {
    const { createRFQ } = await import("../api");
    render(
      <MemoryRouter>
        <CreateRFQ />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("RFQ Title"), { target: { value: "Lane 11 RFQ" } });
    fireEvent.change(screen.getByLabelText("Material"), { target: { value: "Steel Coils" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "20 MT" } });
    fireEvent.change(screen.getByLabelText("Carrier Name"), { target: { value: "Acme Logistics" } });
    fireEvent.change(screen.getByLabelText("Freight Charges"), { target: { value: "42000" } });
    fireEvent.change(screen.getByLabelText("Origin Charges"), { target: { value: "1500" } });
    fireEvent.change(screen.getByLabelText("Destination Charges"), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText("Transit Time (days)"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Validity of Quote"), { target: { value: "7 days" } });

    fireEvent.change(screen.getByLabelText("Bid Start Date & Time"), { target: { value: toInputDate(30) } });
    fireEvent.change(screen.getByLabelText("Bid Close Date & Time"), { target: { value: toInputDate(90) } });
    fireEvent.change(screen.getByLabelText("Forced Bid Close Date & Time"), { target: { value: toInputDate(120) } });
    fireEvent.change(screen.getByLabelText("Pickup / Service Date & Time"), { target: { value: toInputDate(180) } });
    fireEvent.change(screen.getByLabelText("Starting Price (INR)"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("Minimum Decrement (INR)"), { target: { value: "500" } });

    fireEvent.click(screen.getByRole("button", { name: "Create RFQ" }));

    await waitFor(() => {
      expect(createRFQ).toHaveBeenCalledTimes(1);
    });

    const payload = createRFQ.mock.calls[0][0];
    expect(payload.quote_reference_carrier_name).toBe("Acme Logistics");
    expect(payload.quote_reference_freight_charges).toBe(42000);
    expect(payload.quote_reference_origin_charges).toBe(1500);
    expect(payload.quote_reference_destination_charges).toBe(1200);
    expect(payload.quote_reference_transit_time_days).toBe(3);
    expect(payload.quote_validity_requirement).toBe("7 days");
  });
});
