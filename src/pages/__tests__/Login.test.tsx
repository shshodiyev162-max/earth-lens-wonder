import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import Login from "../Login";
import { AuthProvider, useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

const mockedUseAuth = useAuth as unknown as vi.Mock;

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>;
}

describe("Login page", () => {
  it("submits login credentials via auth context", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn();

    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      error: null,
      login,
      register,
      logout: vi.fn(),
    });

    render(<Login />, { wrapper: Wrapper });

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("test@example.com", "password123");
    });
  });
});



