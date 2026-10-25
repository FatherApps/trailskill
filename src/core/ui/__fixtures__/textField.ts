// Synthetic copy for the development gallery, taken from the design-system TextField preview.
export const textFieldFixture = {
  rest: { label: 'Nombre del acudiente', value: 'Paula G.' },
  help: {
    label: 'Correo electrónico',
    placeholder: 'nombre@correo.com',
    help: 'Te enviaremos un código para confirmar.',
  },
  error: {
    label: 'Celular',
    value: '300 12',
    error: 'Faltan dígitos. Escribe los 10 números del celular.',
  },
  protected: {
    label: 'Documento del nadador',
    value: 'Registrado · ••••42',
    help: 'Oculto por privacidad. Solo el acudiente puede verlo.',
  },
};
