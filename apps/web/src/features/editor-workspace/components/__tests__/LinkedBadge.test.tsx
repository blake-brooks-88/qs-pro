import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinkedBadge } from "../LinkedBadge";

describe("LinkedBadge", () => {
  describe("sm variant (default)", () => {
    it("renders icon-only badge by default", () => {
      render(<LinkedBadge />);

      const badge = screen.getByTitle("Linked to Query Activity");
      expect(badge).toBeInTheDocument();
      expect(badge.tagName.toLowerCase()).toBe("span");
    });

    it("sets title to QA name when provided", () => {
      render(<LinkedBadge qaName="My QA" />);

      expect(screen.getByTitle("Linked to My QA")).toBeInTheDocument();
    });

    it("does not render text label in sm variant", () => {
      render(<LinkedBadge qaName="My QA" />);

      expect(screen.queryByText("Linked to My QA")).not.toBeInTheDocument();
      expect(screen.queryByText("Linked")).not.toBeInTheDocument();
    });

    it("renders with emerald color class", () => {
      render(<LinkedBadge />);

      const badge = screen.getByTitle("Linked to Query Activity");
      expect(badge.className).toContain("text-emerald-500");
    });

    it("merges custom className", () => {
      render(<LinkedBadge className="shrink-0" />);

      const badge = screen.getByTitle("Linked to Query Activity");
      expect(badge.className).toContain("shrink-0");
    });
  });

  describe("md variant", () => {
    it("renders text label with QA name", () => {
      render(<LinkedBadge size="md" qaName="Deploy Query" />);

      expect(screen.getByText("Linked to Deploy Query")).toBeInTheDocument();
    });

    it("renders 'Linked' when no QA name", () => {
      render(<LinkedBadge size="md" />);

      expect(screen.getByText("Linked")).toBeInTheDocument();
    });

    it("applies font styling classes", () => {
      const { container } = render(<LinkedBadge size="md" />);

      const badge = container.firstElementChild;
      expect(badge?.className).toContain("text-xs");
      expect(badge?.className).toContain("font-medium");
    });
  });
});
