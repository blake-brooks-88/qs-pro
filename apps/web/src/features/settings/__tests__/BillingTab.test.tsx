import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";
import { server } from "@/test/mocks/server";
import {
  createTenantFeaturesStub,
  createTenantStub,
  createUserStub,
} from "@/test/stubs";

import { BillingTab } from "../components/BillingTab";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
    queryClient,
  };
}

function setupAuth() {
  useAuthStore.setState({
    user: createUserStub({ role: "owner" }),
    tenant: createTenantStub(),
    csrfToken: "csrf",
  });
}

function setupFeatures(tier: "free" | "pro" | "enterprise") {
  server.use(
    http.get("/api/features", () => {
      return HttpResponse.json(
        createTenantFeaturesStub({
          tier,
          currentPeriodEnds: tier !== "free" ? "2026-04-15T00:00:00Z" : null,
        }),
      );
    }),
  );
}

function setupPortalSessionHandler(handler?: Mock) {
  const portalHandler = handler ?? vi.fn();
  server.use(
    http.post("/api/billing/portal", () => {
      portalHandler();
      return HttpResponse.json({
        url: "https://billing.stripe.com/session/test",
      });
    }),
  );
  return portalHandler;
}

describe("BillingTab", () => {
  it("renders upgrade button on free tier without manage billing button", async () => {
    setupAuth();
    setupFeatures("free");

    renderWithProviders(<BillingTab />);

    await screen.findByText("Free");

    expect(
      screen.queryByRole("button", { name: /manage billing/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /upgrade/i }),
    ).toBeInTheDocument();
  });

  it("renders both manage billing and upgrade buttons on pro tier", async () => {
    setupAuth();
    setupFeatures("pro");

    renderWithProviders(<BillingTab />);

    await screen.findByText("Pro");

    expect(
      screen.getByRole("button", { name: /manage billing/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /upgrade/i }),
    ).toBeInTheDocument();
  });

  it("renders only manage billing button on enterprise tier", async () => {
    setupAuth();
    setupFeatures("enterprise");

    renderWithProviders(<BillingTab />);

    await screen.findByText("Enterprise");

    expect(
      screen.getByRole("button", { name: /manage billing/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /upgrade/i }),
    ).not.toBeInTheDocument();
  });

  it("fires portal session mutation when manage billing button is clicked", async () => {
    setupAuth();
    setupFeatures("pro");

    const portalHandler = setupPortalSessionHandler();
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);

    renderWithProviders(<BillingTab />);

    await screen.findByText("Pro");

    const manageBillingButton = screen.getByRole("button", {
      name: /manage billing/i,
    });

    await userEvent.click(manageBillingButton);

    await vi.waitFor(() => {
      expect(portalHandler).toHaveBeenCalled();
    });

    windowOpenSpy.mockRestore();
  });

  it("opens pricing overlay when upgrade button is clicked on free tier", async () => {
    setupAuth();
    setupFeatures("free");

    usePricingOverlayStore.setState({ isOpen: false, source: null });

    renderWithProviders(<BillingTab />);

    await screen.findByText("Free");

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(usePricingOverlayStore.getState().isOpen).toBe(true);
    expect(usePricingOverlayStore.getState().source).toBe("settings_billing");
  });

  it("opens pricing overlay when upgrade button is clicked on pro tier", async () => {
    setupAuth();
    setupFeatures("pro");

    usePricingOverlayStore.setState({ isOpen: false, source: null });

    renderWithProviders(<BillingTab />);

    await screen.findByText("Pro");

    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(usePricingOverlayStore.getState().isOpen).toBe(true);
    expect(usePricingOverlayStore.getState().source).toBe("settings_billing");
  });

  it("disables manage billing button while portal session is pending", async () => {
    setupAuth();
    setupFeatures("pro");

    server.use(
      http.post("/api/billing/portal", () => {
        return new Promise(() => {
          /* never resolves to keep pending state */
        });
      }),
    );

    renderWithProviders(<BillingTab />);

    await screen.findByText("Pro");

    const manageBillingButton = screen.getByRole("button", {
      name: /manage billing/i,
    });

    await userEvent.click(manageBillingButton);

    await vi.waitFor(() => {
      expect(manageBillingButton).toBeDisabled();
    });
  });

  it("renders trial info when trial is active", async () => {
    setupAuth();

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(
          createTenantFeaturesStub({
            tier: "pro",
            trial: {
              active: true,
              daysRemaining: 7,
              endsAt: "2026-03-19T00:00:00Z",
            },
            currentPeriodEnds: null,
          }),
        );
      }),
    );

    renderWithProviders(<BillingTab />);

    await screen.findByText("Pro");

    expect(screen.getByText(/7 day/)).toBeInTheDocument();
  });

  it("renders trial expired message when trial has ended", async () => {
    setupAuth();

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(
          createTenantFeaturesStub({
            tier: "free",
            trial: {
              active: false,
              daysRemaining: 0,
              endsAt: "2026-03-01T00:00:00Z",
            },
          }),
        );
      }),
    );

    renderWithProviders(<BillingTab />);

    await screen.findByText("Free");

    await vi.waitFor(() => {
      expect(screen.getByText(/trial expired/i)).toBeInTheDocument();
    });
  });
});
