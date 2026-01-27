import { lazy, Suspense, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { VaultProvider } from "@/context/VaultContext";

// Lazy load pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Optimized QueryClient with aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1, // Reduce retries for faster failure
    },
  },
});

// Minimal loading fallback
const PageLoader = memo(() => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
));
PageLoader.displayName = 'PageLoader';

const App = memo(() => (
  <QueryClientProvider client={queryClient}>
    <VaultProvider>
      <TooltipProvider delayDuration={300}>
        <Toaster />
        <Sonner 
          position="top-center" 
          toastOptions={{
            duration: 2000,
            className: "!bg-card !border-border !text-foreground",
          }}
        />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </VaultProvider>
  </QueryClientProvider>
));
App.displayName = 'App';

export default App;
