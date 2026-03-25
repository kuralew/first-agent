import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserDashboardContainer from "./UserDashboardContainer.tsx";

const mockDocuments = [
  { id: 1, title: "Contract A", status: "active", clientName: "Acme Corp" },
  { id: 2, title: "NDA Draft", status: "active", clientName: "Beta Inc" },
  { id: 3, title: "Old Filing", status: "archived", clientName: "Charlie LLC" },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("UserDashboardContainer", () => {
  it("renders without crashing", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);
    render(<UserDashboardContainer />);
  });

  it("fetches and displays active documents sorted by client name", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve(mockDocuments),
    } as Response);
    render(<UserDashboardContainer />);

    await waitFor(() => {
      expect(screen.getByText("Contract A")).toBeInTheDocument();
      expect(screen.getByText("NDA Draft")).toBeInTheDocument();
    });
    // Archived doc should not appear
    expect(screen.queryByText("Old Filing")).not.toBeInTheDocument();
  });

  it("displays client names alongside documents", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve(mockDocuments),
    } as Response);
    render(<UserDashboardContainer />);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
      expect(screen.getByText("Beta Inc")).toBeInTheDocument();
    });
  });

  it("filters documents when searching", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve(mockDocuments),
    } as Response);
    render(<UserDashboardContainer />);

    await waitFor(() => {
      expect(screen.getByText("Contract A")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("Search documents");
    fireEvent.change(searchInput, { target: { value: "NDA" } });

    expect(screen.getByText("NDA Draft")).toBeInTheDocument();
    expect(screen.queryByText("Contract A")).not.toBeInTheDocument();
  });

  it("renders the search input", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);
    render(<UserDashboardContainer />);
    expect(screen.getByPlaceholderText("Search documents")).toBeInTheDocument();
  });

  it("renders the Need Help CTA link", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);
    render(<UserDashboardContainer />);
    const link = screen.getByText("Need Help?");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/help");
  });

  it("uses correct body text color (#000042)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: () => Promise.resolve([]),
    } as Response);
    const { container } = render(<UserDashboardContainer />);
    const rootDiv = container.firstChild as HTMLElement;
    expect(rootDiv.style.color).toBe("rgb(0, 0, 66)");
  });
});
