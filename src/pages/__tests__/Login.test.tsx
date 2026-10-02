import { describe, expect, it, vi, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../Login";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", async (original) => {
  const actual = (await original()) as object;
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = useAuth as unknown as Mock;

describe("Login page", () => {
  it("submits credentials through the auth context", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ user: null, loading: false, error: null, demo: false, login, register: vi.fn(), logout: vi.fn() });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(login).toHaveBeenCalledWith("test@example.com", "password123"));
  });

  it("explains demo mode when no backend is configured", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false, error: null, demo: true, login: vi.fn(), register: vi.fn(), logout: vi.fn() });
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Accounts need a backend/i)).toBeInTheDocument();
  });
});
