import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

export function AppVersion({ className = "text-slate-400" }: { className?: string }) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((health) => setVersion(health.version))
      .catch(() => {});
  }, []);

  if (!version) return null;

  return (
    <div className={`text-center text-[11px] ${className}`.trim()}>
      Painel SkoobPet • v{version}
    </div>
  );
}
