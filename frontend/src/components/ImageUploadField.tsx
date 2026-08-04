import { useRef, useState } from "react";

const MAX_MB = 8;

interface ImageUploadFieldProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}

export function ImageUploadField({ label, hint, value, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = async (file: File | null) => {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem (JPG, PNG, etc.).");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`A imagem deve ter no máximo ${MAX_MB} MB.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
    } catch {
      setError("Não foi possível carregar a imagem.");
    }
  };

  const clear = () => {
    onChange(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">{label}</div>
          {hint && <div className="text-xs text-slate-500 mt-0.5">{hint}</div>}
        </div>
        {value && (
          <button type="button" onClick={clear} className="text-xs font-semibold text-red-600 hover:underline shrink-0">
            Remover
          </button>
        )}
      </div>

      {value ? (
        <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
          <img src={value} alt={label} className="w-full max-h-48 object-contain bg-white" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full py-8 rounded-lg border-2 border-dashed border-slate-300 bg-white text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-colors"
        >
          Clique para selecionar ou tirar foto
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0] || null);
        }}
      />

      {value && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
        >
          Trocar imagem
        </button>
      )}

      {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
    </div>
  );
}

export type ContractAnexos = {
  rgFrente?: string | null;
  rgVerso?: string | null;
  carteirinha?: string | null;
  laudo?: string | null;
  fotoAnimal?: string | null;
};

export function compactAnexos(anexos: ContractAnexos): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(anexos)) {
    if (value?.startsWith("data:image/")) out[key] = value;
  }
  return out;
}
