import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import Layout from "@/components/Layout";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <LogIn className="h-12 w-12 text-muted-foreground" />
          <h2 className="font-display text-2xl font-bold text-foreground">Sign in required</h2>
          <p className="max-w-md text-muted-foreground">
            You need to be signed in to access this page.
          </p>
          <Button onClick={signInWithGoogle} className="gap-2">
            Sign in with Google
          </Button>
        </div>
      </Layout>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
