import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthCallbackDemoContainer } from "./AuthCallbackDemoContainer";

vi.mock("./useAuthCallbackDemo", () => ({
  useAuthCallbackDemo: vi.fn(),
}));

import { useAuthCallbackDemo } from "./useAuthCallbackDemo";
const mockUseAuthCallbackDemo = vi.mocked(useAuthCallbackDemo);

describe("AuthCallbackDemoContainer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    mockUseAuthCallbackDemo.mockReturnValue({ description: "" });
    render(<AuthCallbackDemoContainer />);
  });

  it("displays the description from the hook", () => {
    mockUseAuthCallbackDemo.mockReturnValue({
      description: "Case details for client A",
    });
    render(<AuthCallbackDemoContainer />);
    expect(screen.getByText("Case details for client A")).toBeInTheDocument();
  });

  it("renders empty when description is empty", () => {
    mockUseAuthCallbackDemo.mockReturnValue({ description: "" });
    const { container } = render(<AuthCallbackDemoContainer />);
    expect(container.querySelector("div")).toBeInTheDocument();
    expect(container.querySelector("div")?.textContent).toBe("");
  });
});
