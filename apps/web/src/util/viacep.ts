export interface EnderecoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** Consulta o endereço pelo CEP (ViaCEP). Devolve null se não encontrar ou estiver sem internet. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = cep.replace(/\D/g, '');
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    if (!r.ok || j.erro) return null;
    return { logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' };
  } catch {
    return null;
  }
}
