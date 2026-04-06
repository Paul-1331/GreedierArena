import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const Explore = lazy(() => import("./pages/Explore"));
const Creator = lazy(() => import("./pages/Creator"));
const Learn = lazy(() => import("./pages/Learn"));
const Arena = lazy(() => import("./pages/Arena"));
const ArenaLobby = lazy(() => import("./pages/ArenaLobby"));
const ArenaPlay = lazy(() => import("./pages/ArenaPlay"));
const ArenaResults = lazy(() => import("./pages/ArenaResults"));
const PlayQuiz = lazy(() => import("./pages/PlayQuiz"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min — data is fresh, no refetch
      gcTime: 1000 * 60 * 5, // 5 min — cache kept in memory
      retry: 1, // single retry on failure
      refetchOnWindowFocus: false, // don't refetch on tab switch
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/play/:slug" element={<PlayQuiz />} />
              <Route path="/creator" element={<ProtectedRoute><Creator /></ProtectedRoute>} />
              <Route path="/arena" element={<ProtectedRoute><Arena /></ProtectedRoute>} />
              <Route path="/arena/:matchId" element={<ProtectedRoute><ArenaLobby /></ProtectedRoute>} />
              <Route path="/arena/:matchId/play" element={<ProtectedRoute><ArenaPlay /></ProtectedRoute>} />
              <Route path="/arena/:matchId/results" element={<ProtectedRoute><ArenaResults /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
