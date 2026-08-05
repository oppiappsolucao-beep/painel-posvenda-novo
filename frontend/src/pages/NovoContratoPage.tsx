import { FormEvent, useState, useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { saveContract, fetchEmployees, fetchBreeds, type PetSpecies } from "../lib/api";
import {
  CIDADES, ESTADOS, RACAS_CANINA, RACAS_FELINA,
  COLORS, copyToClipboardSync, defaultUnitFilter, formatCpfInput, formatDateInput, isCpfComplete, monthKeyNow,
} from "../lib/utils";

export function NovoContratoPage() {
  const { user, loading, hasRole } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clientSignUrl, setClientSignUrl] = useState("");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [cep, setCep] = useState("");
  const [estado, setEstado] = useState("");
  const [cidadeOpcao, setCidadeOpcao] = useState("");
  const [cidadeOutro, setCidadeOutro] = useState("");
  const [rg, setRg] = useState("");

  const [nomeAnimal, setNomeAnimal] = useState("");
  const [especie, setEspecie] = useState<"" | "CANINA" | "FELINA">("");
  const [racaOpcao, setRacaOpcao] = useState("");
  const [racaOutro, setRacaOutro] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [sexo, setSexo] = useState<"" | "FÊMEA" | "MACHO">("");
  const [pelagem, setPelagem] = useState<"" | "CURTA" | "LONGA">("");
  const [cor, setCor] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const hoje = formatDateInput(new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })));
  const [dataCompra, setDataCompra] = useState(hoje);
  const [valorFilhote, setValorFilhote] = useState("");
  const [valorExtenso, setValorExtenso] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [vendedora, setVendedora] = useState("");
  const [mes, setMes] = useState(monthKeyNow());
  const [unidade, setUnidade] = useState(() => defaultUnitFilter(user?.unit) === "Todas" ? "Campinas" : defaultUnitFilter(user?.unit));

  const { data: employees = [] } = useQuery({
    queryKey: ["employees", unidade],
    queryFn: () => fetchEmployees(unidade),
    enabled: !!user,
  });

  useEffect(() => {
    if (!vendedora) return;
    const stillValid = employees.some((e) => e.name === vendedora);
    if (!stillValid) setVendedora("");
  }, [employees, unidade, vendedora]);

  const { data: breedList = [] } = useQuery({
    queryKey: ["breeds", especie],
    queryFn: () => fetchBreeds(especie as PetSpecies),
    enabled: !!user && (especie === "CANINA" || especie === "FELINA"),
  });

  const racas = useMemo(() => {
    const fallback = especie === "CANINA" ? RACAS_CANINA : especie === "FELINA" ? RACAS_FELINA : [];
    const names = breedList.length > 0
      ? breedList.map((b) => b.name)
      : fallback.filter((r) => r !== "Outro");
    return [...names, "Outro"];
  }, [breedList, especie]);

  useEffect(() => {
    setRacaOpcao("");
    setRacaOutro("");
  }, [especie]);

  if (!loading && !user) return <Navigate to="/login" replace />;
  if (!loading && hasRole("financeiro")) return <Navigate to="/financeiro" replace />;

  const raca = racaOpcao === "Outro" ? racaOutro : racaOpcao;
  const cidade = cidadeOpcao === "Outro" ? cidadeOutro : cidadeOpcao;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setClientSignUrl("");
    setCpfError("");

    if (!isCpfComplete(cpf)) {
      setCpfError("CPF obrigatório no formato 123.456.789-00 (11 dígitos).");
      return;
    }

    setSubmitting(true);

    const contrato: Record<string, string> = {
      Nome: nome,
      Telefone: telefone,
      CPF: cpf,
      "E-mail": email,
      "Data Compra": dataCompra,
      Mês: mes,
      Raça: raca,
      Sexo: sexo,
      Cor: cor,
      Pelagem: pelagem,
      Endereço: endereco,
      Número: numero,
      Complemento: complemento,
      CEP: cep,
      Estado: estado,
      Cidade: cidade,
      RG: rg,
      "Valor Filhote": valorFilhote,
      "Valor por extenso": valorExtenso,
      "Forma de pagamento": formaPagamento,
      "Quantidade de parcelas": parcelas,
      Vendedora: vendedora,
      "Nome do animal": nomeAnimal,
      Espécie: especie,
      Microchip: microchip,
      "Nascimento filhote": nascimento,
      Observações: observacoes,
      Unidade: unidade,
    };

    try {
      const result = await saveContract(contrato);
      setSuccess("Contrato salvo com sucesso! PDF baixado automaticamente.");
      if (result.clientSignUrl) {
        setClientSignUrl(result.clientSignUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar contrato.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout title="Novo Contrato" emoji="📄" caption="Preencha todos os dados do comprador, filhote e venda.">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-6 md:p-8 space-y-8">
        {error && <div className="text-red-600 bg-red-50 rounded-xl p-3 text-sm">{error}</div>}
        {success && <div className="text-green-700 bg-green-50 rounded-xl p-3 text-sm">{success}</div>}
        {clientSignUrl && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="font-semibold text-blue-900">Link para o cliente assinar</div>
            <p className="text-sm text-blue-800">
              Envie este link por WhatsApp ou e-mail para o cliente assinar o contrato no celular.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={clientSignUrl}
                className="flex-1 rounded-lg border border-blue-200 px-3 py-2 text-sm bg-white text-slate-700"
              />
              <button
                type="button"
                onClick={() => copyToClipboardSync(clientSignUrl)}
                className="px-4 py-2 rounded-lg text-white font-semibold text-sm shrink-0"
                style={{ background: COLORS.navy }}
              >
                Copiar link
              </button>
            </div>
          </div>
        )}

        <Section title="Dados do comprador" icon="👤">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome do comprador" value={nome} onChange={setNome} required />
            <Field label="E-mail" value={email} onChange={setEmail} required />
            <Field label="Endereço" value={endereco} onChange={setEndereco} />
            <CpfField
              label="CPF"
              value={cpf}
              onChange={(v) => {
                setCpf(v);
                if (cpfError) setCpfError("");
              }}
              error={cpfError}
            />
            <Field label="Nº da residência" value={numero} onChange={setNumero} />
            <Field label="Contato (WhatsApp)" value={telefone} onChange={setTelefone} required />
            <Field label="Complemento" value={complemento} onChange={setComplemento} />
            <Field label="RG" value={rg} onChange={setRg} />
            <Field label="CEP" value={cep} onChange={setCep} />
            <Select label="Estado" value={estado} onChange={setEstado} options={ESTADOS} />
            <Select label="Cidade" value={cidadeOpcao} onChange={setCidadeOpcao} options={CIDADES} placeholder="Selecione" />
            {cidadeOpcao === "Outro" && <Field label="Digite a cidade" value={cidadeOutro} onChange={setCidadeOutro} />}
          </div>
        </Section>

        <Section title="Dados do filhote" icon="🐾">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome do animal" value={nomeAnimal} onChange={setNomeAnimal} />
            <Radio label="Sexo" value={sexo} onChange={setSexo as (v: string) => void} options={["FÊMEA", "MACHO"]} />
            <Radio label="Espécie" value={especie} onChange={setEspecie as (v: string) => void} options={["CANINA", "FELINA"]} />
            <Radio label="Pelagem" value={pelagem} onChange={setPelagem as (v: string) => void} options={["CURTA", "LONGA"]} />
            {especie && (
              <>
                <Select label="Raça" value={racaOpcao} onChange={setRacaOpcao} options={racas} placeholder="Selecione" />
                {racaOpcao === "Outro" && <Field label="Digite a raça" value={racaOutro} onChange={setRacaOutro} />}
              </>
            )}
            <Field label="Microchip" value={microchip} onChange={setMicrochip} />
            <Field label="Nascimento (DD/MM/AAAA)" value={nascimento} onChange={setNascimento} placeholder="DD/MM/AAAA" />
            <Field label="Cor" value={cor} onChange={setCor} required />
            <Field label="Observações" value={observacoes} onChange={setObservacoes} />
            <Field label="Data da compra (DD/MM/AAAA)" value={dataCompra} onChange={setDataCompra} required />
          </div>
        </Section>

        <Section title="Dados da venda" icon="🛒">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Valor do filhote" value={valorFilhote} onChange={setValorFilhote} required placeholder="Ex: 4500,00" />
            <Field label="Valor por extenso" value={valorExtenso} onChange={setValorExtenso} />
            <Field label="Forma de pagamento" value={formaPagamento} onChange={setFormaPagamento} />
            <Field label="Quantidade de parcelas" value={parcelas} onChange={setParcelas} />
            {employees.length > 0 ? (
              <SelectField
                label="Vendedora"
                value={vendedora}
                onChange={setVendedora}
                options={employees.map((e) => e.name)}
                placeholder="Selecione a vendedora"
                required
              />
            ) : (
              <Field label="Vendedora" value={vendedora} onChange={setVendedora} placeholder="Cadastre no acesso Controle" />
            )}
            <Field label="Mês" value={mes} onChange={setMes} />
            <Field label="Unidade" value={unidade} onChange={setUnidade} readOnly={!!user?.unit} />
          </div>
        </Section>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 rounded-xl text-white font-bold text-lg disabled:opacity-60"
          style={{ background: COLORS.navy }}
        >
          {submitting ? "Salvando..." : "💾 Salvar Contrato"}
        </button>
      </form>
    </AppLayout>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-black mb-4 flex items-center gap-2" style={{ color: COLORS.navy }}>
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder, readOnly }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}{required && " *"}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5${readOnly ? " bg-slate-100" : ""}`}
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, required, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}{required && " *"}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white"
      >
        <option value="">{placeholder || "Selecione"}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </label>
  );
}

function CpfField({ label, value, onChange, error }: {
  label: string; value: string; onChange: (v: string) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label} *</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatCpfInput(e.target.value))}
        required
        maxLength={14}
        placeholder="123.456.789-00"
        pattern="\d{3}\.\d{3}\.\d{3}-\d{2}"
        title="CPF no formato 123.456.789-00"
        className={`mt-1 w-full rounded-xl border px-4 py-2.5 ${error ? "border-red-400 bg-red-50" : "border-slate-200"}`}
      />
      {error && <span className="text-xs text-red-600 mt-1 block">{error}</span>}
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 bg-white">
        <option value="">{placeholder || "Selecione"}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Radio({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-600 mb-2">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={label} value={o} checked={value === o} onChange={() => onChange(o)} />
            <span className="text-sm">{o}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
