import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isLoginPending2fa } from "../lib/api";
import { COLORS } from "../lib/utils";
import { Logo } from "../components/Logo";

const TWO_FA_EMAIL = "contato@skoobpet.com.br";

export function LoginPage() {
  const { user, loading, login, verify2fa } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  if (!loading && user) return <Navigate to="/operacao" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(username, password);
      if (isLoginPending2fa(result)) {
        setChallengeId(result.challengeId);
        setTwoFactorCode("");
      } else {
        navigate("/operacao");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "E-mail ou senha inválidos.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify2fa = async (e: FormEvent) => {
    e.preventDefault();
    if (!challengeId) return;
    setError("");
    setSubmitting(true);
    try {
      await verify2fa(challengeId, twoFactorCode);
      navigate("/operacao");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Código inválido.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const backToLogin = () => {
    setChallengeId(null);
    setTwoFactorCode("");
    setError("");
  };

  if (challengeId) {
    return (
      <LoginShell
        title="Verificação em duas etapas"
        subtitle={`Código enviado para ${TWO_FA_EMAIL}`}
        placeholder=""
        onSubmit={handleVerify2fa}
        username={username}
        password=""
        setUsername={() => {}}
        setPassword={() => {}}
        error={error}
        submitting={submitting}
        hideCredentials
        twoFactorCode={twoFactorCode}
        setTwoFactorCode={setTwoFactorCode}
        footer={
          <button type="button" onClick={backToLogin} className="text-sm text-slate-500 hover:text-slate-700">
            ← Voltar ao login
          </button>
        }
      />
    );
  }

  return (
    <LoginShell
      title="Operação SkoobPet"
      subtitle="Painel interno de pós-venda"
      placeholder=""
      onSubmit={handleSubmit}
      username={username}
      password={password}
      setUsername={setUsername}
      setPassword={setPassword}
      error={error}
      submitting={submitting}
      footer={<Link to="/login/financeiro" className="text-sm" style={{ color: COLORS.wine }}>Acesso financeiro →</Link>}
    />
  );
}

export function LoginFinanceiroPage() {
  const { loading, login, hasRole } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && hasRole("financeiro")) return <Navigate to="/financeiro" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password, "financeiro");
      navigate("/financeiro");
    } catch {
      setError("Credenciais financeiras inválidas.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LoginShell
      title="Financeiro SkoobPet"
      subtitle="Acesso restrito à diretoria"
      placeholder="controle@skoobpet.com.br"
      onSubmit={handleSubmit}
      username={username}
      password={password}
      setUsername={setUsername}
      setPassword={setPassword}
      error={error}
      submitting={submitting}
      footer={<Link to="/login" className="text-sm text-slate-500">← Voltar ao login de operação</Link>}
    />
  );
}

function LoginShell({
  title,
  subtitle,
  placeholder,
  onSubmit,
  username,
  password,
  setUsername,
  setPassword,
  error,
  submitting,
  footer,
  hideCredentials = false,
  twoFactorCode = "",
  setTwoFactorCode,
}: {
  title: string;
  subtitle: string;
  placeholder: string;
  onSubmit: (e: FormEvent) => void;
  username: string;
  password: string;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  error: string;
  submitting: boolean;
  footer: React.ReactNode;
  hideCredentials?: boolean;
  twoFactorCode?: string;
  setTwoFactorCode?: (v: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/login-bg.png?v=4')",
        backgroundColor: "#4a4a52",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <div className="flex justify-center">
            <Logo variant="circle" size={176} />
          </div>
          <p className="text-white font-medium mt-3 text-[15px] drop-shadow-sm">{subtitle}</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-2xl p-8 border border-white/80">
          <h2 className="text-xl font-black text-center mb-6" style={{ color: COLORS.navy }}>{title}</h2>
          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}

          {!hideCredentials ? (
            <>
              <label className="block mb-4">
                <span className="text-sm font-semibold text-slate-600">E-mail</span>
                <input
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder={placeholder}
                  autoComplete="username"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/30"
                  required
                />
              </label>
              <label className="block mb-6">
                <span className="text-sm font-semibold text-slate-600">Senha</span>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-12 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/30"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.84 2.84M9.88 9.88A3 3 0 0112 9c2.76 0 5 2 5 4.5 0 .73-.18 1.42-.5 2.03M6.1 6.1C4.22 7.3 2.78 9.02 2 11c1.73 3.03 5.27 5 10 5 1.55 0 3-.27 4.33-.72" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.12 14.12A3 3 0 0112 15c-2.76 0-5-2-5-4.5 0-.73.18-1.42.5-2.03" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
            </>
          ) : (
            <label className="block mb-6">
              <span className="text-sm font-semibold text-slate-600">Código de verificação</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode?.(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 bg-white text-center text-2xl tracking-[0.4em] font-bold focus:outline-none focus:ring-2 focus:ring-[#1B1D6D]/30"
                required
                maxLength={6}
              />
              <p className="mt-2 text-xs text-slate-500 text-center">
                Verifique a caixa de entrada de <strong>{TWO_FA_EMAIL}</strong> e digite o código de 6 dígitos.
              </p>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-white font-bold disabled:opacity-60 shadow-md hover:opacity-95 transition-opacity"
            style={{ background: COLORS.navy }}
          >
            {submitting ? "Aguarde..." : hideCredentials ? "Confirmar código" : "Entrar"}
          </button>
          <div className="mt-4 text-center">{footer}</div>
        </form>
      </div>
    </div>
  );
}
