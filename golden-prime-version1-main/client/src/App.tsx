import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { PwaLifecycle } from "@/components/PwaLifecycle";
import { lazy, Suspense, useEffect, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { BuildingWorkspaceProvider } from "./contexts/BuildingWorkspaceContext";
import { DeletionSafetyProvider } from "./components/DeletionSafety";
import { MotionProvider } from "./contexts/MotionContext";

const Billing = lazy(() => import("@/pages/Billing"));
const AccountSecurity = lazy(() => import("@/pages/AccountSecurity"));
const Buildings = lazy(() => import("@/pages/Buildings"));
const Collections = lazy(() => import("@/pages/Collections"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const Exports = lazy(() => import("@/pages/Exports"));
const Login = lazy(() => import("@/pages/Login"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const OfflineSnapshot = lazy(() => import("@/pages/OfflineSnapshot"));
const OwnerOverview = lazy(() => import("@/pages/OwnerOverview"));
const Reminders = lazy(() => import("@/pages/Reminders"));
const Rooms = lazy(() => import("@/pages/Rooms"));
const Vacancies = lazy(() => import("@/pages/Vacancies"));
const Profit = lazy(() => import("@/pages/Profit"));
const PaymentSettings = lazy(() => import("@/pages/PaymentSettings"));
const Settings = lazy(() => import("@/pages/Settings"));
const TenantPortal = lazy(() => import("@/pages/TenantPortal"));
const Tenants = lazy(() => import("@/pages/Tenants"));

function RouteLoading() {
  return <div className="grid min-h-[12rem] place-items-center" aria-label="Loading page"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
}

function BuildingWorkspaceEntry() {
  const { user } = useAuth();
  return user?.role === "admin" || user?.role === "manager" ? <Redirect to="/buildings" /> : <Dashboard />;
}

function WorkspaceRoutes() {
  const [location] = useLocation();
  return <div key={location} className="app-page-transition"><Switch>
    <Route path="/" component={BuildingWorkspaceEntry} />
    <Route path="/buildings" component={Buildings} />
    <Route path="/overview" component={Dashboard} />
    <Route path="/rooms" component={Rooms} />
    <Route path="/tenants" component={Tenants} />
    <Route path="/billing" component={Billing} />
    <Route path="/collections" component={Collections} />
    <Route path="/vacancies" component={Vacancies} />
    <Route path="/profit" component={Profit} />
    <Route path="/payment-settings" component={PaymentSettings} />
    <Route path="/account-security" component={AccountSecurity} />
    <Route path="/notifications" component={Notifications} />
    <Route path="/expenses" component={Expenses} />
    <Route path="/reminders" component={Reminders} />
    <Route path="/exports" component={Exports} />
    <Route path="/settings" component={Settings} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch></div>;
}

function AppShell() {
  const { user, loading } = useAuth();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const syncConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);
  if (!isOnline) return <Redirect to="/offline" />;
  if (loading) return <div className="grid min-h-screen place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!user) return <Redirect to="/login" />;
  if (user.role === "tenant") return <TenantPortal />;
  if (user.role === "admin") return <OwnerOverview />;
  return <BuildingWorkspaceProvider><DashboardLayout><WorkspaceRoutes /></DashboardLayout></BuildingWorkspaceProvider>;
}

function Router() {
  return <Switch><Route path="/offline" component={OfflineSnapshot} /><Route path="/login" component={Login} /><Route path="/tenant" component={AppShell} /><Route component={AppShell} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><MotionProvider><TooltipProvider><Toaster /><PwaLifecycle /><DeletionSafetyProvider><Suspense fallback={<RouteLoading />}><Router /></Suspense></DeletionSafetyProvider></TooltipProvider></MotionProvider></ThemeProvider></ErrorBoundary>;
}
