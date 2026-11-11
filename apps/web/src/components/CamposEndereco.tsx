import { Grid, Loader, Select, TextInput } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useState } from 'react';
import { UFS } from '@cemiterio/shared';
import { mascaraCep } from '../util/mascaras';
import type { ValoresSocio } from '../util/socioForm';
import { buscarCep } from '../util/viacep';
import { CampoMascara } from './CampoMascara';

export function CamposEndereco({ form, compacto = false }: { form: UseFormReturnType<ValoresSocio>; compacto?: boolean }) {
  const [buscando, setBuscando] = useState(false);

  async function aoMudarCep(valor: string) {
    form.setFieldValue('cep', valor);
    if (valor.replace(/\D/g, '').length !== 8) return;
    setBuscando(true);
    const end = await buscarCep(valor);
    setBuscando(false);
    if (!end) return;
    form.setValues({
      logradouro: end.logradouro || form.getValues().logradouro,
      bairro: end.bairro || form.getValues().bairro,
      cidade: end.cidade,
      uf: end.uf,
    });
  }

  const size = compacto ? 'sm' : undefined;
  return (
    <Grid gap="sm">
      <Grid.Col span={{ base: 12, sm: 3 }}>
        <CampoMascara
          label="CEP"
          size={size}
          mascara={mascaraCep}
          placeholder="00000-000"
          rightSection={buscando ? <Loader size="xs" /> : null}
          {...form.getInputProps('cep')}
          onChange={aoMudarCep}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: 7 }}>
        <TextInput label="Logradouro" size={size} placeholder="Rua, avenida..." {...form.getInputProps('logradouro')} />
      </Grid.Col>
      <Grid.Col span={{ base: 4, sm: 2 }}>
        <TextInput label="Número" size={size} {...form.getInputProps('numero')} />
      </Grid.Col>
      {!compacto && (
        <Grid.Col span={{ base: 8, sm: 4 }}>
          <TextInput label="Complemento" {...form.getInputProps('complemento')} />
        </Grid.Col>
      )}
      <Grid.Col span={{ base: compacto ? 8 : 12, sm: compacto ? 4 : 3 }}>
        <TextInput label="Bairro" size={size} {...form.getInputProps('bairro')} />
      </Grid.Col>
      <Grid.Col span={{ base: 8, sm: compacto ? 6 : 3 }}>
        <TextInput label="Cidade" size={size} {...form.getInputProps('cidade')} />
      </Grid.Col>
      <Grid.Col span={{ base: 4, sm: 2 }}>
        <Select label="UF" size={size} data={[...UFS]} searchable clearable {...form.getInputProps('uf')} />
      </Grid.Col>
    </Grid>
  );
}
