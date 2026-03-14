import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initAuthInterceptor, getToken } from "@/lib/auth";

// Pages
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import IDEPage from "@/pages/ide";
import NotFound from "@/pages/not-found";

import { useGetMe } from "@workspace/api-client-react";

// Initialize the fetch interceptor BEFORE anything else runs
initAuthInterceptor();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Auth Guard Component
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const token = getToken();
  
  // This hook relies on the custom fetch interceptor initialized above
  const { data: user, isLoading, isError } = useGetMe({
    query: { 
      retry: false,
      enabled: !!token
    }
  });

  useEffect(() => {
    if (!token || isError) {
      setLocation("/login");
    }
  }, [token, isError, setLocation]);

  if (isLoading) {
    return <div className="h-screen w-full bg-background flex items-center justify-center">Loading...</div>;
  }

  if (!user && !isLoading) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthPage} />
      
      {/* Protected Routes */}
      <Route path="/">
        <RequireAuth><Dashboard /></RequireAuth>
      </Route>
      <Route path="/project/:projectId">
        <RequireAuth><IDEPage /></RequireAuth>
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
