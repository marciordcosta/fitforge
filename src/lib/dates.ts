/**
 * Semana ancorada em terça-feira (mesma convenção usada para peso corporal):
 * delta = (diaDaSemana - 2 + 7) % 7, onde getDay() retorna 0=domingo..6=sábado.
 */

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parseia "YYYY-MM-DD" como data local (meia-noite), evitando o shift de fuso do `new Date(string)`. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function inicioSemana(date: Date): Date {
  const dia = date.getDay();
  const delta = (dia - 2 + 7) % 7;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - delta);
  return d;
}

export function chaveSemana(date: Date): string {
  return toISODate(inicioSemana(date));
}

export function hojeISO(): string {
  return toISODate(new Date());
}

/** Soma (ou subtrai, com dias negativo) dias a uma data ISO. */
export function somarDias(iso: string, dias: number): string {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));
}
