// Mensagem legível de qualquer erro (AggregateError do pg/node vem com message vazia)
export function msg(e: unknown): string {
  if (e instanceof AggregateError && e.errors.length) return msg(e.errors[0]);
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const http = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode; // erros do SDK da AWS
    return (e.message || code || e.name) + (http ? ` (HTTP ${http})` : '');
  }
  return String(e);
}
