import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CaseList from "./CaseList.tsx";

describe("CaseList", () => {
  const mockOnSelectCase = vi.fn();

  it("renders without crashing", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
  });

  it("displays case titles", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    expect(screen.getByText("Smith vs Jones")).toBeInTheDocument();
    expect(screen.getByText("Brown vs State")).toBeInTheDocument();
  });

  it("displays attorney names", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
  });

  it("displays formatted due dates", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    // Dates render based on local timezone; verify both date spans exist
    const spans = screen.getAllByText(/^\d{1,2}\/\d{1,2}\/2024$/);
    expect(spans).toHaveLength(2);
  });

  it("calls onSelectCase when Select Case button is clicked", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    const buttons = screen.getAllByText("Select Case");
    fireEvent.click(buttons[0]);
    expect(mockOnSelectCase).toHaveBeenCalledWith(1);
  });

  it("filters cases by priority", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    const prioritySelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(prioritySelect, { target: { value: "high" } });
    expect(screen.getByText("Smith vs Jones")).toBeInTheDocument();
    expect(screen.queryByText("Brown vs State")).not.toBeInTheDocument();
  });

  it("renders View Details links for each case", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    const links = screen.getAllByText("View Details");
    expect(links).toHaveLength(2);
    expect(links[0].closest("a")).toHaveAttribute("href", "/cases/1");
    expect(links[1].closest("a")).toHaveAttribute("href", "/cases/2");
  });

  it("renders the Add New Case CTA link", () => {
    render(<CaseList onSelectCase={mockOnSelectCase} />);
    const link = screen.getByText("+ Add New Case");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/cases/new");
  });

  it("uses correct body text color (#000042)", () => {
    const { container } = render(<CaseList onSelectCase={mockOnSelectCase} />);
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.style.color).toBe("rgb(0, 0, 66)");
  });
});
