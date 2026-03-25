import { render, screen, fireEvent } from "@testing-library/react";
import UserProfile from "./UserProfile.tsx";

describe("UserProfile", () => {
  const defaultProps = { name: "John Doe", email: "john@example.com" };

  it("renders without crashing", () => {
    render(<UserProfile {...defaultProps} />);
  });

  it("displays name and email in view mode", () => {
    render(<UserProfile {...defaultProps} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("shows Edit Profile button in view mode", () => {
    render(<UserProfile {...defaultProps} />);
    expect(screen.getByText("Edit Profile")).toBeInTheDocument();
  });

  it("switches to edit mode when Edit Profile is clicked", () => {
    render(<UserProfile {...defaultProps} />);
    fireEvent.click(screen.getByText("Edit Profile"));
    expect(screen.getByDisplayValue("John Doe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("john@example.com")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("updates name input value on change", () => {
    render(<UserProfile {...defaultProps} />);
    fireEvent.click(screen.getByText("Edit Profile"));
    const nameInput = screen.getByDisplayValue("John Doe");
    fireEvent.change(nameInput, { target: { value: "Jane Doe" } });
    expect(screen.getByDisplayValue("Jane Doe")).toBeInTheDocument();
  });

  it("updates email input value on change", () => {
    render(<UserProfile {...defaultProps} />);
    fireEvent.click(screen.getByText("Edit Profile"));
    const emailInput = screen.getByDisplayValue("john@example.com");
    fireEvent.change(emailInput, { target: { value: "jane@example.com" } });
    expect(screen.getByDisplayValue("jane@example.com")).toBeInTheDocument();
  });

  it("returns to view mode when Save is clicked", () => {
    render(<UserProfile {...defaultProps} />);
    fireEvent.click(screen.getByText("Edit Profile"));
    fireEvent.click(screen.getByText("Save"));
    expect(screen.getByText("Edit Profile")).toBeInTheDocument();
  });
});
