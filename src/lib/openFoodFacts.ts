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

/** Resultado de busca por nome — sempre tem código de barras (é assim que a Open Food Facts indexa
 * cada produto internamente, mesmo quando a busca foi por texto, não por escaneamento). */
export interface ProdutoOpenFoodFactsBusca extends ProdutoOpenFoodFacts {
  codigoBarras: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Extrai os campos que interessam de um produto bruto da API — usado tanto pela busca por código
 * de barras (1 produto) quanto pela busca por nome (lista). Retorna null se faltar algum dos 4
 * macros essenciais (não dá pra cadastrar um alimento sem eles). */
function mapearProduto(p: Record<string, unknown>): ProdutoOpenFoodFacts | null {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const calorias = n["energy-kcal_100g"] as number | undefined;
  const proteina = n["proteins_100g"] as number | undefined;
  const gordura = n["fat_100g"] as number | undefined;
  const carboidrato = n["carbohydrates_100g"] as number | undefined;
  if (calorias == null || proteina == null || gordura == null || carboidrato == null) return null;

  const fibra = (n["fiber_100g"] as number | undefined) ?? null;
  const gorduraSaturada = (n["saturated-fat_100g"] as number | undefined) ?? null;
  const gorduraInsaturada = gorduraSaturada != null ? Math.max(0, gordura - gorduraSaturada) : null;

  // "product_name" pode vir no idioma de quem cadastrou o produto (geralmente inglês) mesmo pedindo
  // lc=pt na URL -- "product_name_pt" é o campo com a tradução de fato marcada como português,
  // quando existe, então tem prioridade.
  const nome = ((p.product_name_pt as string | undefined) || (p.product_name as string | undefined))?.trim();
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

/**
 * Busca um produto pelo código de barras na Open Food Facts (base pública e gratuita, sem chave de API).
 * Os valores retornados são sempre por 100g, como a API fornece. Retorna null se o produto não existir
 * ou se faltar algum dos 4 macros essenciais (não dá pra cadastrar um alimento sem eles).
 */
export async function buscarProdutoPorCodigoBarras(codigo: string): Promise<ProdutoOpenFoodFacts | null> {
  const resp = await fetch(
    `https://br.openfoodfacts.org/api/v2/product/${encodeURIComponent(codigo)}.json?fields=product_name,product_name_pt,brands,nutriments&lc=pt`,
  );
  if (!resp.ok) throw new Error("Falha ao consultar a Open Food Facts.");
  const json = await resp.json();
  if (json.status !== 1 || !json.product) return null;
  return mapearProduto(json.product as Record<string, unknown>);
}

/**
 * Busca produtos pelo nome na Open Food Facts — complementar ao catálogo local/TACO, útil pra
 * produtos industrializados/embalados (o forte da Open Food Facts é justamente ter marca e código
 * de barras; comida caseira/in natura tende a não estar lá ou ter dados inconsistentes).
 * Ignora produtos sem código de barras ou sem os 4 macros essenciais.
 */
export async function buscarProdutosPorNome(nome: string): Promise<ProdutoOpenFoodFactsBusca[]> {
  const resp = await fetch(
    `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(nome)}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,product_name_pt,brands,nutriments&lc=pt`,
  );
  if (!resp.ok) throw new Error("Falha ao pesquisar na Open Food Facts.");
  const json = await resp.json();
  const produtos = (json.products ?? []) as Record<string, unknown>[];
  const resultado: ProdutoOpenFoodFactsBusca[] = [];
  for (const p of produtos) {
    const codigo = p.code as string | undefined;
    if (!codigo) continue;
    const mapeado = mapearProduto(p);
    if (mapeado) resultado.push({ ...mapeado, codigoBarras: codigo });
  }
  return resultado;
}
