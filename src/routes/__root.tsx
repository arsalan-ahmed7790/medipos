import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AppHeader } from "@/components/AppHeader";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ===================== 404 ===================== */
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
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go to Billing
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ===================== ROUTE ===================== */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

/* ===================== ROOT ===================== */
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const routerState = useRouterState();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  /* ✅ Initial session check */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    /* ✅ Listen to auth changes (VERY IMPORTANT) */
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  /* ✅ Route protection */
  useEffect(() => {
    if (loading) return;

    const path = routerState.location.pathname;

    const isAuthPage = path === "/login" || path === "/signup";

    /* ❌ Not logged in → redirect to login */
    if (!session && !isAuthPage) {
      navigate({ to: "/login" });
    }

    /* ✅ Logged in → prevent going back to login/signup */
    if (session && isAuthPage) {
      navigate({ to: "/" });
    }
  }, [session, loading, routerState.location.pathname, navigate]);

  /* ⏳ Block UI until auth resolved */
  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {/* ❌ Hide header on auth pages */}
        {session && <AppHeader />}

        <main>
          <Outlet />
        </main>

        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
