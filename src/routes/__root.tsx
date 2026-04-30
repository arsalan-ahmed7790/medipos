import { Outlet, Link, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/AppHeader";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MediPOS — Pharmacy Billing & Thermal Receipts" },
      { name: "description", content: "Fast, clean point-of-sale billing for medical stores." },
      { property: "og:title", content: "MediPOS — Pharmacy Billing & Thermal Receipts" },
      { property: "og:description", content: "Fast, clean point-of-sale billing for medical stores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "MediPOS — Pharmacy Billing & Thermal Receipts" },
      { name: "twitter:description", content: "Fast, clean point-of-sale billing for medical stores." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fbecc137-432f-43b6-817a-499a8e3d4619/id-preview-6de0db45--3b310495-8555-4969-88b4-a2b6b47675cb.lovable.app-1776842980094.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fbecc137-432f-43b6-817a-499a8e3d4619/id-preview-6de0db45--3b310495-8555-4969-88b4-a2b6b47675cb.lovable.app-1776842980094.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main>
          <Outlet />
        </main>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
