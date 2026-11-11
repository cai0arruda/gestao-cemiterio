import { TextInput, type TextInputProps } from '@mantine/core';

interface Props extends Omit<TextInputProps, 'onChange'> {
  mascara: (v: string) => string;
  onChange?: (valor: string) => void;
}

/** Campo de texto que formata enquanto digita (data, CPF, telefone, CEP). */
export function CampoMascara({ mascara, onChange, ...props }: Props) {
  return <TextInput inputMode="numeric" {...props} onChange={(e) => onChange?.(mascara(e.currentTarget.value))} />;
}
