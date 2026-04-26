import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import Login from "./Login";
import Signup from "./Signup";

vi.mock("../api", () => ({
  login: vi.fn(async () => ({
    data: {
      access_token: "token",
      role: "buyer",
      username: "buyer1",
    },
  })),
  signup: vi.fn(async () => ({
    data: {
      access_token: "token",
      role: "supplier",
      username: "user2",
    },
  })),
}));

describe("Login and Signup", () => {
  it("renders login form fields", async () => {
    render(
      <MemoryRouter>
        <Login onLogin={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /company name or email/i })
    ).toBeInTheDocument();
  });

  it("renders signup form fields", async () => {
    const onSignup = vi.fn();
    render(
      <MemoryRouter>
        <Signup onSignup={onSignup} />
      </MemoryRouter>
    );

    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
  });
});
