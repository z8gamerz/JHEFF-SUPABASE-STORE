import React, { Suspense, lazy } from 'react';
import { RouterProvider, usePathname } from '@/lib/router-shim';
import { ThemeProvider } from '@/lib/contexts/theme-context';
import { DeviceProvider } from '@/lib/contexts/device-context';
import { AuthProvider } from '@/lib/contexts/auth-context';
import { ReceiptProvider } from '@/lib/context/receipt-context';
import { StoreProvider } from '@/lib/hooks/use-store';
import { OfflineIndicator } from '@/components/pwa/offline-indicator';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

// Lazy-loaded Pages for instant bundle delivery and minimal device memory usage
const Home = lazy(() => import('@/pages/page'));
const Login = lazy(() => import('@/pages/login/page'));
const Signup = lazy(() => import('@/pages/signup/page'));
const Pos = lazy(() => import('@/pages/pos/page'));
const PosHistory = lazy(() => import('@/pages/pos/history/page'));
const EwalletHistory = lazy(() => import('@/pages/pos/ewallet-history/page'));
const Products = lazy(() => import('@/pages/products/page'));
const Categories = lazy(() => import('@/pages/categories/page'));
const Restocking = lazy(() => import('@/pages/restocking/page'));
const Utang = lazy(() => import('@/pages/utang/page'));
const Expenses = lazy(() => import('@/pages/expenses/page'));
const Settings = lazy(() => import('@/pages/settings/page'));
const Reports = lazy(() => import('@/pages/reports/page'));
const ReportsDaily = lazy(() => import('@/pages/reports/daily/page'));
const ReportsSalesJournal = lazy(() => import('@/pages/reports/sales-journal/page'));
const ReportsCredits = lazy(() => import('@/pages/reports/credits/page'));
const AdminAuditTrail = lazy(() => import('@/pages/admin/audit-trail/page'));
const AdminUsers = lazy(() => import('@/pages/admin/users/page'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 transition-colors">
      <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
    </div>
  );
}

function AppContent() {
  const pathname = usePathname();

  // Route matching logic with lazy loaded components
  switch (pathname) {
    case '/':
      return <Home />;
    case '/login':
      return <Login />;
    case '/signup':
      return <Signup />;
    case '/pos':
      return <Pos />;
    case '/pos/history':
      return <PosHistory />;
    case '/pos/ewallet-history':
      return <EwalletHistory />;
    case '/products':
      return <Products />;
    case '/categories':
      return <Categories />;
    case '/restocking':
      return <Restocking />;
    case '/utang':
      return <Utang />;
    case '/expenses':
      return <Expenses />;
    case '/settings':
      return <Settings />;
    case '/reports':
      return <Reports />;
    case '/reports/daily':
      return <ReportsDaily />;
    case '/reports/sales-journal':
      return <ReportsSalesJournal />;
    case '/reports/credits':
    case '/reports/credit':
      return <ReportsCredits />;
    case '/admin/audit-trail':
      return <AdminAuditTrail />;
    case '/admin/users':
      return <AdminUsers />;
    default:
      return <Home />;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <DeviceProvider>
        <ThemeProvider>
          <RouterProvider>
            <AuthProvider>
              <StoreProvider>
                <ReceiptProvider>
                  <ToastProvider>
                    <div className="min-h-screen w-full flex flex-col bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors">
                      <Suspense fallback={<PageLoader />}>
                        <AppContent />
                      </Suspense>
                      <OfflineIndicator />
                    </div>
                  </ToastProvider>
                </ReceiptProvider>
              </StoreProvider>
            </AuthProvider>
          </RouterProvider>
        </ThemeProvider>
      </DeviceProvider>
    </ErrorBoundary>
  );
}
