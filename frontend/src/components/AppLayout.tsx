import { ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Logo } from "./Logo";
import { COLORS } from "../lib/utils";

interface AppLayoutProps {
  title: string;
  caption?: string;
  emoji?: string;
  children: ReactNode;
  requireFinance?: boolean;
}

export function AppLayout({ title, caption, emoji, children, requireFinance }: AppLayoutProps) {
  const { logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="max-w-[1240px] mx-auto px-4 py-2 pb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-10 h-10 rounded-xl bg-white shadow text-xl font-bold"
            aria-label="Menu"
          >
            ☰
          </button>
          {menuOpen && (
            <div className="absolute top-12 left-0 z-50 w-56 bg-white rounded-2xl shadow-xl p-4 border border-slate-100">
              <div className="font-black text-slate-900">Menu</div>
              <div className="text-xs text-slate-500 mb-3">Escolha uma área</div>
              <nav className="flex flex-col gap-1">
                <MenuLink to="/visao-geral" onClick={() => setMenuOpen(false)}>📊 Visão Geral</MenuLink>
                <MenuLink to="/operacao" onClick={() => setMenuOpen(false)}>⚙️ Operação</MenuLink>
                <MenuLink to="/novo-contrato" onClick={() => setMenuOpen(false)}>📄 Novo Contrato</MenuLink>
                <MenuLink to="/status-assinatura" onClick={() => setMenuOpen(false)}>✍️ Status De Assinatura</MenuLink>
                {hasRole("financeiro") ? (
                  <MenuLink to="/financeiro" onClick={() => setMenuOpen(false)}>💰 Financeiro</MenuLink>
                ) : (
                  <MenuLink to="/login/financeiro" onClick={() => setMenuOpen(false)}>💰 Financeiro</MenuLink>
                )}
              </nav>
              <div className="text-[11px] text-slate-400 mt-3 pt-2 border-t">Painel interno • PetShop</div>
            </div>
          )}
        </div>

        <div className="flex-1 text-center">
          <div className="flex justify-center mb-1">
            <Logo size={78} />
          </div>
          <h1 className="text-xl font-black text-slate-900 m-0">{emoji} {title}</h1>
          {caption && <p className="text-sm text-slate-500 mt-1">{caption}</p>}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 rounded-xl bg-white shadow text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Sair
        </button>
      </div>

      {requireFinance && !hasRole("financeiro") ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow">
          <p className="text-slate-600 mb-4">Acesso financeiro necessário.</p>
          <Link to="/login/financeiro" className="text-white px-6 py-2 rounded-xl font-bold" style={{ background: COLORS.wine }}>
            Fazer login financeiro
          </Link>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function MenuLink({ to, children, onClick }: { to: string; children: ReactNode; onClick: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

interface FilterBarProps {
  meses: string[];
  unidades: string[];
  mes: string;
  unidade: string;
  onMesChange: (v: string) => void;
  onUnidadeChange: (v: string) => void;
}

export function FilterBar({ meses, unidades, mes, unidade, onMesChange, onUnidadeChange }: FilterBarProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-600 mb-1 block">Mês</span>
        <select
          value={mes}
          onChange={(e) => onMesChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white shadow-sm"
        >
          {meses.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-600 mb-1 block">Unidade</span>
        <select
          value={unidade}
          onChange={(e) => onUnidadeChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white shadow-sm"
        >
          {unidades.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
