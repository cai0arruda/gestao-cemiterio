import { NumberInput, type NumberInputProps } from '@mantine/core';

interface Props extends Omit<NumberInputProps, 'value' | 'onChange'> {
  /** Valor em centavos. */
  value: number | null;
  onChange: (centavos: number | null) => void;
}

/** Campo de valor em reais; trabalha internamente em centavos (sem erros de arredondamento). */
export function CampoDinheiro({ value, onChange, ...props }: Props) {
  return (
    <NumberInput
      prefix="R$ "
      decimalSeparator=","
      thousandSeparator="."
      decimalScale={2}
      fixedDecimalScale
      min={0}
      hideControls
      {...props}
      value={value === null ? '' : value / 100}
      onChange={(v) => onChange(v === '' || v === null ? null : Math.round(Number(v) * 100))}
    />
  );
}
