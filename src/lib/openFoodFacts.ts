export interface ProdutoOpenFoodFacts {
  nome: string;
  marca: string | null;
  caloriasPorPorcao: number;
  proteinaG: number;
  gorduraG: number;
  carboidratoG: number;
  fibraG: number | null;
  gorduraSaturadaG: number | null;
  gorduraInsaturadaG: number | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Busca um produto pelo código de barras na Open Food Facts (base pública e gratuita, sem chave de API).
 * Os valores retornados são sempre por 100g, como a API fornece. Retorna null se o produto não existir
 * ou se faltar algum dos 4 macros essenciais (não dá pra cadastrar um alimento sem eles).
 */
export async function buscarProdutoPorCodigoBarras(codigo: string): Promise<ProdutoOpenFoodFacts | null> {
  const resp = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json?fields=product_name,brands,nutriments`,
  );
  if (!resp.ok) throw new Error("Falha ao consultar a Open Food Facts.");
  const json = await resp.json();
  if (json.status !== 1 || !json.product) return null;

  const p = json.product as Record<string, unknown>;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const calorias = n["energy-kcal_100g"] as number | undefined;
  const proteina = n["proteins_100g"] as number | undefined;
  const gordura = n["fat_100g"] as number | undefined;
  const carboidrato = n["carbohydrates_100g"] as number | undefined;
  if (calorias == null || proteina == null || gordura == null || carboidrato == null) return null;

  const fibra = (n["fiber_100g"] as number | undefined) ?? null;
  const gorduraSaturada = (n["saturated-fat_100g"] as number | undefined) ?? null;
  const gorduraInsaturada = gorduraSaturada != null ? Math.max(0, gordura - gorduraSaturada) : null;

  const nome = (p.product_name as string | undefined)?.trim();
  const marca = (p.brands as string | undefined)?.split(",")[0]?.trim();

  return {
    nome: nome || "Produto sem nome",
    marca: marca || null,
    caloriasPorPorcao: round1(calorias),
    proteinaG: round1(proteina),
    gorduraG: round1(gordura),
    carboidratoG: round1(carboidrato),
    fibraG: fibra != null ? round1(fibra) : null,
    gorduraSaturadaG: gorduraSaturada != null ? round1(gorduraSaturada) : null,
    gorduraInsaturadaG: gorduraInsaturada != null ? round1(gorduraInsaturada) : null,
  };
}
