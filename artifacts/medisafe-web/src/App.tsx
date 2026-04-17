import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import AddMedicinePage from "@/pages/add-medicine";
import CheckPage from "@/pages/check";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col pt-14 md:pt-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/" /> : <LoginPage />}
      </Route>
      <Route path="/register">
        {user ? <Redirect to="/" /> : <RegisterPage />}
      </Route>
      <Route path="/">
        <AuthGuard><DashboardPage /></AuthGuard>
      </Route>
      <Route path="/add-medicine">
        <AuthGuard><AddMedicinePage /></AuthGuard>
      </Route>
      <Route path="/check">
        <AuthGuard><CheckPage /></AuthGuard>
      </Route>
      <Route path="/profile">
        <AuthGuard><ProfilePage /></AuthGuard>
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AppRouter />
      </WouterRouter>
    </AuthProvider>
  );
}
