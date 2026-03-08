import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { TwoFactorPage } from "@/features/auth/TwoFactorPage";
import { TwoFactorSetupPage } from "@/features/auth/TwoFactorSetupPage";
import { InvoiceCreatePage } from "@/features/invoicing/InvoiceCreatePage";
import { InvoiceListPage } from "@/features/invoicing/InvoiceListPage";
import { TenantDetailPage } from "@/features/tenants/TenantDetailPage";
import { TenantListPage } from "@/features/tenants/TenantListPage";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-muted-foreground">
        This page is under construction.
      </p>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <AuthLayout>
                  <LoginPage />
                </AuthLayout>
              }
            />
            <Route
              path="/2fa"
              element={
                <AuthLayout>
                  <TwoFactorPage />
                </AuthLayout>
              }
            />
            <Route
              path="/2fa-setup"
              element={
                <AuthLayout>
                  <TwoFactorSetupPage />
                </AuthLayout>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/tenants" replace />} />
              <Route
                path="tenants"
                element={<TenantListPage />}
              />
              <Route
                path="tenants/:tenantId"
                element={<TenantDetailPage />}
              />
              <Route
                path="invoicing"
                element={<InvoiceListPage />}
              />
              <Route
                path="invoicing/create"
                element={
                  <ProtectedRoute requiredRole="editor">
                    <InvoiceCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <PlaceholderPage title="Settings" />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="bottom-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
