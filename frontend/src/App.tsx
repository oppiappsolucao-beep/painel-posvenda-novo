import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage, LoginFinanceiroPage } from "./pages/LoginPage";
import { OperacaoDashboard } from "./pages/OperacaoDashboard";
import { FinanceiroDashboard } from "./pages/FinanceiroDashboard";
import { FuncionariosPage } from "./pages/FuncionariosPage";
import { RacasPage } from "./pages/RacasPage";
import { VisaoGeralPage } from "./pages/VisaoGeralPage";
import { NovoContratoPage } from "./pages/NovoContratoPage";
import { StatusAssinaturaPage } from "./pages/StatusAssinaturaPage";
import { AssinarContratoPage } from "./pages/AssinarContratoPage";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/financeiro" element={<LoginFinanceiroPage />} />
            <Route path="/operacao" element={<ProtectedRoute><OperacaoDashboard /></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute><FinanceiroDashboard /></ProtectedRoute>} />
            <Route path="/funcionarios" element={<ProtectedRoute><FuncionariosPage /></ProtectedRoute>} />
            <Route path="/racas" element={<ProtectedRoute><RacasPage /></ProtectedRoute>} />
            <Route path="/visao-geral" element={<ProtectedRoute><VisaoGeralPage /></ProtectedRoute>} />
            <Route path="/novo-contrato" element={<ProtectedRoute><NovoContratoPage /></ProtectedRoute>} />
            <Route path="/status-assinatura" element={<ProtectedRoute><StatusAssinaturaPage /></ProtectedRoute>} />
            <Route path="/assinar/:token" element={<AssinarContratoPage />} />
            <Route path="*" element={<Navigate to="/operacao" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
