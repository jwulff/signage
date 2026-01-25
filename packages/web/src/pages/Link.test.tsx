import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Link } from "./Link";

describe("Link page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title", () => {
    render(<Link />);
    expect(screen.getByText("Link Oura Ring")).toBeInTheDocument();
  });

  it("renders the display name input", () => {
    render(<Link />);
    expect(screen.getByLabelText("Display Name")).toBeInTheDocument();
  });

  it("renders the continue button", () => {
    render(<Link />);
    expect(screen.getByRole("button", { name: "Continue to Oura" })).toBeInTheDocument();
  });

  it("shows error when submitting empty name", () => {
    render(<Link />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.getByText("Please enter your name")).toBeInTheDocument();
  });

  it("shows error when submitting whitespace-only name", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.getByText("Please enter your name")).toBeInTheDocument();
  });

  it("shows error for invalid characters in name", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John@Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(
      screen.getByText("Name can only contain letters, numbers, and spaces (max 20 chars)")
    ).toBeInTheDocument();
  });

  it("shows error for special characters", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "Test!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(
      screen.getByText("Name can only contain letters, numbers, and spaces (max 20 chars)")
    ).toBeInTheDocument();
  });

  it("accepts valid name with letters only", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    // No error message for valid input
    expect(screen.queryByText("Please enter your name")).not.toBeInTheDocument();
    expect(screen.queryByText(/Name can only contain/)).not.toBeInTheDocument();
  });

  it("accepts valid name with numbers", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.queryByText(/Name can only contain/)).not.toBeInTheDocument();
  });

  it("accepts valid name with spaces", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.queryByText(/Name can only contain/)).not.toBeInTheDocument();
  });

  it("trims whitespace from name", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "  John  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    // Should not show the "empty name" error since whitespace is trimmed
    expect(screen.queryByText("Please enter your name")).not.toBeInTheDocument();
  });

  it("shows redirecting state when form is submitted with valid name", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.getByRole("button", { name: "Redirecting..." })).toBeInTheDocument();
  });

  it("disables input when submitting", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.getByLabelText("Display Name")).toBeDisabled();
  });

  it("disables button when submitting", () => {
    render(<Link />);

    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    expect(screen.getByRole("button", { name: "Redirecting..." })).toBeDisabled();
  });

  it("displays subtitle explaining the feature", () => {
    render(<Link />);

    expect(
      screen.getByText("Connect your Oura Ring to display your readiness score.")
    ).toBeInTheDocument();
  });

  it("displays hint about initial display", () => {
    render(<Link />);

    expect(
      screen.getByText("Your first initial will be shown next to your readiness score.")
    ).toBeInTheDocument();
  });

  it("displays back link", () => {
    render(<Link />);

    expect(screen.getByText("← Back to Display")).toBeInTheDocument();
  });

  it("has placeholder text in input", () => {
    render(<Link />);

    expect(screen.getByPlaceholderText("e.g., John")).toBeInTheDocument();
  });

  it("input has correct type", () => {
    render(<Link />);

    const input = screen.getByLabelText("Display Name");
    expect(input).toHaveAttribute("type", "text");
  });

  it("updates input value when typing", () => {
    render(<Link />);

    const input = screen.getByLabelText("Display Name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test" } });

    expect(input.value).toBe("Test");
  });

  it("clears error when typing valid name after error", () => {
    render(<Link />);

    // Submit empty to trigger error
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));
    expect(screen.getByText("Please enter your name")).toBeInTheDocument();

    // Type valid name and submit
    fireEvent.change(screen.getByLabelText("Display Name"), {
      target: { value: "John" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Oura" }));

    // Error should be cleared
    expect(screen.queryByText("Please enter your name")).not.toBeInTheDocument();
  });
});
