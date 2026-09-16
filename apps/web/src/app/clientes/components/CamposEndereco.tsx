import { Field, SelectField } from "@oxys/shared/components/Field";
import { ESTADOS_BR, maskCep } from "@oxys/shared/masks";
import { ROTULOS_ENDERECO, type DadosEnderecoForm } from "../tipos";
import type { ErrosForm } from "../validacao";

interface CamposEnderecoProps {
  dados: DadosEnderecoForm;
  onAlterar: (dados: DadosEnderecoForm) => void;
  erros: ErrosForm;
  /** prefixo dos ids/erros para não colidir com outros campos do formulário */
  prefixo?: string;
}

export function CamposEndereco({ dados, onAlterar, erros, prefixo = "" }: CamposEnderecoProps) {
  const set = <K extends keyof DadosEnderecoForm>(campo: K, valor: DadosEnderecoForm[K]) =>
    onAlterar({ ...dados, [campo]: valor });
  const id = (campo: string) => `${prefixo}${campo}`;
  const rotuloPersonalizado = !ROTULOS_ENDERECO.includes(dados.rotulo);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <div className="sm:col-span-3">
        <SelectField
          id={id("rotulo")}
          label="Tipo de endereço"
          value={rotuloPersonalizado ? "__outro" : dados.rotulo}
          onChange={(e) => set("rotulo", e.target.value === "__outro" ? "" : e.target.value)}
        >
          {ROTULOS_ENDERECO.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value="__outro">Outro…</option>
        </SelectField>
      </div>
      {rotuloPersonalizado ? (
        <div className="sm:col-span-3">
          <Field
            id={id("rotulo_texto")}
            label="Nome do endereço"
            value={dados.rotulo}
            maxLength={60}
            onChange={(e) => set("rotulo", e.target.value)}
            erro={erros[id("rotulo")]}
          />
        </div>
      ) : (
        <div className="hidden sm:col-span-3 sm:block" aria-hidden="true" />
      )}

      <div className="sm:col-span-2">
        <Field
          id={id("cep")}
          label="CEP"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          value={maskCep(dados.cep)}
          onChange={(e) => set("cep", e.target.value)}
          erro={erros[id("cep")]}
        />
      </div>
      <div className="sm:col-span-4">
        <Field
          id={id("logradouro")}
          label="Logradouro *"
          autoComplete="address-line1"
          maxLength={200}
          value={dados.logradouro}
          onChange={(e) => set("logradouro", e.target.value)}
          erro={erros[id("logradouro")]}
        />
      </div>
      <div className="sm:col-span-2">
        <Field
          id={id("numero")}
          label="Número"
          maxLength={20}
          placeholder="s/n"
          value={dados.numero}
          onChange={(e) => set("numero", e.target.value)}
        />
      </div>
      <div className="sm:col-span-4">
        <Field
          id={id("complemento")}
          label="Complemento"
          autoComplete="address-line2"
          maxLength={120}
          value={dados.complemento}
          onChange={(e) => set("complemento", e.target.value)}
        />
      </div>
      <div className="sm:col-span-6">
        <Field
          id={id("bairro")}
          label="Bairro"
          maxLength={120}
          value={dados.bairro}
          onChange={(e) => set("bairro", e.target.value)}
        />
      </div>
      <div className="sm:col-span-4">
        <Field
          id={id("cidade")}
          label="Cidade *"
          autoComplete="address-level2"
          maxLength={120}
          value={dados.cidade}
          onChange={(e) => set("cidade", e.target.value)}
          erro={erros[id("cidade")]}
        />
      </div>
      <div className="sm:col-span-2">
        <SelectField
          id={id("estado")}
          label="UF *"
          value={dados.estado}
          onChange={(e) => set("estado", e.target.value)}
          erro={erros[id("estado")]}
        >
          <option value="">—</option>
          {ESTADOS_BR.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
