#!/usr/bin/env node
/**
 * export-data.mjs — VineAtlas
 *
 * Liga-se ao Supabase (utilizador só-de-leitura `looker_ro`), lê as views
 * de consumo, e substitui a constante de dados embebida em cada página
 * HTML do site (radar.html, onde-vender.html, premiumizacao.html,
 * ficha.html, balanca.html). Corre localmente (`node scripts/export-data.mjs`)
 * ou via GitHub Actions (ver .github/workflows/export-data.yml).
 *
 * Requisitos:
 *   - variável de ambiente DATABASE_URL com a connection string do
 *     utilizador looker_ro (Session pooler, porta 5432, SSL ativo)
 *   - `npm install pg`
 *
 * balanca.html (acrescentado 2026-09-17):
 *   Ao contrário das outras 4 páginas, os 4 blocos de dados de
 *   balanca.html (BAL, ES, CATS, PAISES) não usam nenhuma das views `v_*`
 *   listadas no dicionário como "usar sempre" — três vêm de tabelas de
 *   facto diretas (fact_importacoes_acondicionamento, fact_importacoes_tipo,
 *   fact_importacoes) e BAL usa v_balanca_comercial_vinho, que não consta
 *   dessa lista mas é a view certa para este caso (é a única que já soma
 *   exportação e importação pela mesma chave). Todas as 4 queries foram
 *   corridas contra a base real (kflwylllrmvlsssegxch) em 2026-09-17 e os
 *   resultados batem exatamente (ao cêntimo/kg) com os valores hardcoded
 *   que já estavam no ficheiro, para os 16 anos 2010-2025 onde aplicável.
 *   Ver comentários em cada função fetchBalanca*() para o detalhe da
 *   validação. Ainda assim, antes do primeiro commit: correr localmente
 *   e conferir o diff do balanca.html, porque a validação foi feita numa
 *   sessão de leitura direta à base, não através deste próprio script.
 *
 * NOTA DE ROBUSTEZ:
 *   A substituição usa uma expressão regular que apanha desde
 *   `const RAW = [` (ou `const D = {`) até ao `];`/`};` seguinte. Isto
 *   funciona com o formato atual dos ficheiros, mas é frágil a edições
 *   manuais futuras que insiram outro `];`/`};` no meio. Recomenda-se,
 *   numa próxima revisão do site, envolver o bloco de dados em
 *   marcadores explícitos, por exemplo:
 *     <script>
 *     /* DATA:START *\/ const RAW = [...]; /* DATA:END *\/
 *     ...
 *   o que tornaria esta substituição imune a esse risco.
 */

import { Client } from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(__dirname, '..'); // raiz do repo do site

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Arredonda mantendo null como null (Postgres numeric -> JS number). */
function r(v, decimals = null) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return decimals === null ? n : Number(n.toFixed(decimals));
}

/** Substitui `const NOME = <valor>;` num ficheiro por um novo valor JSON. */
function replaceConst(filePath, varName, newValue) {
  const full = path.join(SITE_DIR, filePath);
  const src = readFileSync(full, 'utf8');

  // Aceita tanto `[` (array) como `{` (objeto) a seguir ao `=`, e
  // qualquer espaçamento à volta do `=` (ex.: balanca.html tem
  // "const BAL = [" mas "const CATS=[", sem espaço).
  const re = new RegExp(
    `const ${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});`
  );

  if (!re.test(src)) {
    throw new Error(
      `Não encontrei "const ${varName} = ...;" em ${filePath}. ` +
      `O ficheiro pode ter sido editado manualmente — confirmar antes de continuar.`
    );
  }

  const json = JSON.stringify(newValue);
  const updated = src.replace(re, `const ${varName} = ${json};`);
  writeFileSync(full, updated, 'utf8');

  const before = Buffer.byteLength(src, 'utf8');
  const after = Buffer.byteLength(updated, 'utf8');
  console.log(`  ${filePath}: ${before} -> ${after} bytes`);
}

// ---------------------------------------------------------------------
// Queries + transformações por página
// ---------------------------------------------------------------------

async function fetchRadar(client) {
  const { rows } = await client.query(`
    select ano, nome_destino, valor_eur, volume_kg, preco_eur_kg,
           cagr4_valor_pct, yoy_valor_pct, quota_valor_pct, rank_valor,
           valor_base_cagr4
    from v_radar_mercados
    where ano_completo = true
    order by ano, rank_valor
  `);
  return rows.map((row) => ({
    ano: row.ano,
    m: row.nome_destino,
    v: r(row.valor_eur),
    kg: r(row.volume_kg),
    p: r(row.preco_eur_kg, 2),
    cagr: r(row.cagr4_valor_pct, 1),
    yoy: r(row.yoy_valor_pct, 1),
    q: r(row.quota_valor_pct, 2),
    rk: row.rank_valor,
    base: r(row.valor_base_cagr4),
  }));
}

async function fetchOndeVender(client) {
  const { rows } = await client.query(`
    select ano, categoria, pais, valor_1000eur, preco_medio_eur_litro,
           quota_categoria_pct, rank_no_tipo, yoy_valor_pct, cagr4_valor_pct
    from v_onde_vender_tipo
    order by ano, categoria, rank_no_tipo
  `);
  return rows.map((row) => ({
    ano: row.ano,
    cat: row.categoria,
    m: row.pais,
    v: r(row.valor_1000eur),
    pl: r(row.preco_medio_eur_litro, 2),
    q: r(row.quota_categoria_pct, 1),
    rk: row.rank_no_tipo,
    yoy: r(row.yoy_valor_pct, 1),
    cagr: r(row.cagr4_valor_pct, 1),
  }));
}

async function fetchPremiumizacao(client) {
  const { rows: natRows } = await client.query(`
    select ano, valor_nominal_meur, valor_real2025_meur,
           preco_nominal_eur_kg, preco_real2025_eur_kg
    from v_nacional_real
    order by ano
  `);
  const nat = natRows.map((row) => ({
    ano: row.ano,
    vn: r(row.valor_nominal_meur, 1),
    vr: r(row.valor_real2025_meur, 1),
    pn: r(row.preco_nominal_eur_kg, 3),
    pr: r(row.preco_real2025_eur_kg, 3),
  }));

  const { rows: premRows } = await client.query(`
    select ano, pais, preco_medio_eur_litro, quota_cert_valor_pct,
           quota_cert_volume_pct
    from v_premiumizacao
    order by pais, ano
  `);
  const prem = premRows.map((row) => ({
    ano: row.ano,
    m: row.pais,
    pl: r(row.preco_medio_eur_litro, 3),
    cv: r(row.quota_cert_valor_pct, 1),
    cvol: r(row.quota_cert_volume_pct, 1),
  }));

  return { nat, prem };
}

/**
 * Ano "atual" partilhado entre fetchFicha e fetchCambioFicha, para que o
 * cartão de câmbio no ficha.html mostre sempre o mesmo ano que os KPIs
 * principais da página (nunca desalinhados um do outro).
 */
async function getAnoAtualFicha(client) {
  // v_ficha_mercado_anual não tem coluna ano_completo (verificado
  // 2026-09-17, após falha real em produção: "column ano_completo does
  // not exist"). A view já só devolve anos fechados por construção —
  // max(ano) confirmado = 2025, sem o 2026 parcial aparecer.
  const { rows } = await client.query(`
    select max(ano) as ano from v_ficha_mercado_anual
  `);
  return rows[0].ano;
}

async function fetchFicha(client, anoAtual) {
  const { rows: fichaRows } = await client.query(
    `
    select nome_destino, valor_eur, volume_kg, preco_eur_kg,
           quota_valor_pct, rank_valor, yoy_valor_pct, cagr4_valor_pct,
           premio_preco_vs_nacional, preco_nacional_eur_kg
    from v_ficha_mercado_anual
    where ano = $1
    order by rank_valor
  `,
    [anoAtual]
  );
  const ficha = fichaRows.map((row) => ({
    m: row.nome_destino,
    v: r(row.valor_eur),
    kg: r(row.volume_kg),
    p: r(row.preco_eur_kg, 3),
    q: r(row.quota_valor_pct, 2),
    rk: row.rank_valor,
    yoy: r(row.yoy_valor_pct, 1),
    cagr: r(row.cagr4_valor_pct, 1),
    premio: r(row.premio_preco_vs_nacional, 2),
    pnac: r(row.preco_nacional_eur_kg, 3),
  }));

  const { rows: sazonRows } = await client.query(`
    select nome_destino, mes, indice_saz_valor, indice_saz_volume
    from v_sazonalidade_mercado
    order by nome_destino, mes
  `);
  const sazon = sazonRows.map((row) => ({
    m: row.nome_destino,
    mes: row.mes,
    iv: r(row.indice_saz_valor, 3),
    ivol: r(row.indice_saz_volume, 3),
  }));

  const { rows: mensalRows } = await client.query(`
    select nome_destino, to_char(mes_ano, 'YYYY-MM') as ym, valor_eur, volume_kg
    from v_exportacoes_paises
    where mes_ano >= '2019-01-01'
    order by nome_destino, mes_ano
  `);
  const mensal = mensalRows.map((row) => ({
    m: row.nome_destino,
    ym: row.ym,
    v: r(row.valor_eur),
    kg: r(row.volume_kg),
  }));

  return { ficha, sazon, mensal };
}

/**
 * Constante CAMBIO do ficha.html — cartão "O que o comprador sentiu"
 * (2026-09-17). Restrita aos mesmos ~24 mercados de D.ficha e ao mesmo
 * anoAtual, para nunca desalinhar do resto da página. Mercados sem moeda
 * mapeada em dim_moeda_destino (ex.: Angola, Guiné-Bissau) ou sem ano
 * cambial completo (ex.: Rússia desde 2022-03, ver comentário em
 * dim_cambio) ficam de fora do array — front-end trata a ausência como
 * "sem dado disponível", nunca como efeito zero.
 */
async function fetchCambioFicha(client, anoAtual) {
  const { rows } = await client.query(
    `
    select v.nome_destino, v.moeda, v.var_preco_eur_pct, v.var_preco_moeda_local_pct
    from v_efeito_cambio_mercado v
    where v.ano = $1
      and v.moeda is not null
      and v.taxa_ano_completo = true
      and v.codigo_destino in (
        select codigo_destino from v_radar_mercados
        where ano = $1 and rank_valor <= 24
      )
    order by v.nome_destino
  `,
    [anoAtual]
  );
  return rows.map((row) => ({
    m: row.nome_destino,
    moeda: row.moeda,
    veur: r(row.var_preco_eur_pct, 1),
    vloc: r(row.var_preco_moeda_local_pct, 1),
  }));
}

// ---------------------------------------------------------------------
// balanca.html (acrescentado 2026-09-17 — ver caveat no topo do ficheiro)
// ---------------------------------------------------------------------

/**
 * Determina o último ano com os 12 meses presentes em fact_importacoes
 * (que hoje se estende até um mês de 2026, portanto parcial nesse ano).
 * Usa contagem de meses distintos em vez de uma data fixa, para que o
 * script continue correto quando 2026 fechar e passar a ter 12 meses
 * também. VALIDADO 2026-09-17: devolve 2025 (12 meses distintos; 2026
 * tinha só 7 à data da validação), consistente com o valor hardcoded
 * que já estava em PAISES.
 *
 * Nota de implementação: usar count(distinct mes_ano), não count(*) —
 * fact_importacoes tem grão (mes_ano, codigo_origem), portanto count(*)
 * conta ~316 linhas por mês (grelha densa por destino), não meses.
 */
async function getAnoCompletoImportacoes(client) {
  const { rows } = await client.query(`
    select extract(year from mes_ano)::int as ano,
           count(distinct mes_ano) as meses
    from fact_importacoes
    group by 1
    having count(distinct mes_ano) = 12
    order by 1 desc
    limit 1
  `);
  if (rows.length === 0) {
    throw new Error('getAnoCompletoImportacoes: nenhum ano com 12 meses completos em fact_importacoes.');
  }
  return rows[0].ano;
}

/**
 * BAL — série anual 2010-atual, exportação vs importação (kg e €).
 *
 * VALIDADO 2026-09-17 contra a base real (16 anos, 2010-2025, ao cêntimo
 * e ao kg — corresponde exatamente aos valores já hardcoded no ficheiro).
 *
 * A primeira versão desta função somava a linha
 * dim_destino.tipo='total_mundial' (MUNDO) das tabelas de facto — essa
 * abordagem estava ERRADA: confirmou-se que v_balanca_comercial_vinho
 * não tem nenhuma linha MUNDO (é FULL OUTER JOIN só de codigo com
 * dim_destino.tipo='pais_territorio', 252 códigos). A soma direta desta
 * view é a fonte certa. Só inclui anos com os 12 meses presentes
 * (count(distinct mes_ano) = 12), para nunca misturar o ano corrente
 * parcial (2026, só 7 meses à data da validação) com anos fechados.
 */
async function fetchBalancaBAL(client) {
  const { rows } = await client.query(`
    select extract(year from mes_ano)::int as ano,
           sum(volume_kg_exportado) as exp_kg,
           sum(volume_kg_importado) as imp_kg,
           sum(valor_eur_exportado) as exp_eur,
           sum(valor_eur_importado) as imp_eur,
           count(distinct mes_ano) as meses
    from v_balanca_comercial_vinho
    group by 1
    having count(distinct mes_ano) = 12
    order by 1
  `);
  return rows.map((row) => ({
    ano: row.ano,
    exp_kg: r(row.exp_kg, 0),
    imp_kg: r(row.imp_kg, 0),
    exp_eur: r(row.exp_eur, 0),
    imp_eur: r(row.imp_eur, 0),
  }));
}

/**
 * ES — importação de Espanha por tamanho de recipiente (HL), granel
 * (>10L) vs engarrafado (<=2L), série anual completa. Fonte:
 * fact_importacoes_acondicionamento. Note-se a lacuna documentada:
 * Itália 2023 falta o ano inteiro nesta tabela (não afeta Espanha), e a
 * faixa 2-10L só existe a partir de 2017 — nenhuma das duas afeta este
 * cálculo (só usa >10L e <=2L de Espanha).
 */
async function fetchBalancaES(client) {
  const { rows } = await client.query(`
    select ano,
           sum(case when faixa = '>10L' then valor end) as granel,
           sum(case when faixa = '<=2L' then valor end) as eng
    from fact_importacoes_acondicionamento
    where pais = 'Espanha' and medida = 'Volume_HL'
    group by ano
    order by ano
  `);
  return rows.map((row) => ({
    ano: row.ano,
    granel: r(row.granel, 2),
    eng: r(row.eng, 2),
  }));
}

/**
 * CATS — composição por categoria da importação nacional (HL), no ano
 * mais recente disponível em fact_importacoes_tipo para 'Total Nacional'.
 * Exclui a meta-categoria 'Total' (regra 4 do dicionário: nunca somar
 * incluindo o Total). Rótulos amigáveis abaixo — CATEGORIA_LABEL —
 * mapeiam 'Sem DO/IG' e 'Residual não especificado' para os nomes que já
 * apareciam no balanca.html hardcoded ('Sem DO/IG (granel/mesa)' e
 * 'Não alocado'). ESTE MAPEAMENTO NÃO ESTÁ CONFIRMADO NO SCHEMA — foi
 * inferido por os valores em HL baterem com os já existentes no
 * ficheiro. Confirmar antes do commit.
 */
const CATEGORIA_LABEL = {
  'Sem DO/IG': 'Sem DO/IG (granel/mesa)',
  'Residual não especificado': 'Não alocado',
  Espumantes: 'Espumantes',
  IG: 'IG',
  DO: 'DO',
  Licoroso: 'Licoroso',
};

async function fetchBalancaCATS(client) {
  const { rows } = await client.query(`
    select categoria, valor
    from fact_importacoes_tipo
    where pais = 'Total Nacional'
      and medida = 'Volume_HL'
      and categoria <> 'Total'
      and ano = (
        select max(ano) from fact_importacoes_tipo where pais = 'Total Nacional'
      )
    order by valor desc
  `);
  return rows.map((row) => ({
    nome: CATEGORIA_LABEL[row.categoria] ?? row.categoria,
    hl: r(row.valor, 2),
  }));
}

/**
 * dim_destino.nome usa a forma oficial longa do INE (confirmado
 * 2026-09-17 contra a base — o mesmo padrão aparece em v_radar_mercados,
 * portanto não é um problema desta tabela em particular). O balanca.html
 * hardcoded já usava as formas curtas para estes 3; mapeamento explícito
 * para manter a mesma convenção. Nomes fora deste mapa passam tal como
 * vêm da base — rever esta lista se um país novo com nome oficial longo
 * entrar no top-10 num ano futuro.
 */
const PAIS_LABEL_CURTO = {
  'Estados Unidos da América': 'Estados Unidos',
  'Países Baixos (Reino dos)': 'Países Baixos',
  'Reino Unido (não incluindo a Irlanda do Norte)': 'Reino Unido',
};

/**
 * PAISES — top-10 países de origem da importação (INE, fact_importacoes)
 * por valor em €, no último ano com os 12 meses completos (ver
 * getAnoCompletoImportacoes). Filtra dim_destino.tipo='pais_territorio'
 * (regra 10 do dicionário — mesma regra de fact_exportacoes).
 *
 * VALIDADO 2026-09-17: os 10 valores em € batem exatamente com os já
 * hardcoded no ficheiro para 2025. Os nomes vêm longos da base (ver
 * PAIS_LABEL_CURTO acima) — sem o mapeamento, 3 dos 10 nomes seriam
 * diferentes dos que já estavam no balanca.html.
 */
async function fetchBalancaPAISES(client) {
  const ano = await getAnoCompletoImportacoes(client);
  const { rows } = await client.query(
    `
    select dd.nome as pais, sum(fi.valor_eur) as eur
    from fact_importacoes fi
    join dim_destino dd on dd.codigo = fi.codigo_origem
    where dd.tipo = 'pais_territorio'
      and extract(year from fi.mes_ano) = $1
    group by dd.nome
    order by eur desc
    limit 10
  `,
    [ano]
  );
  return rows.map((row) => ({
    nome: PAIS_LABEL_CURTO[row.pais] ?? row.pais,
    eur: r(row.eur, 0),
  }));
}

// ---------------------------------------------------------------------
// Configuração das páginas
//
// Cada entrada em `targets` é uma `const NOME = ...;` diferente dentro do
// MESMO ficheiro (ex.: ficha.html tem `const D` e, desde 2026-09-17,
// também `const CAMBIO`, como duas declarações top-level separadas no
// <script> — não uma dentro da outra). O loop principal aplica-as todas
// ao mesmo ficheiro, uma a seguir à outra.
// ---------------------------------------------------------------------

const PAGES = [
  {
    file: 'radar.html',
    targets: [{ varName: 'RAW', fetch: fetchRadar }],
  },
  {
    file: 'onde-vender.html',
    targets: [{ varName: 'RAW', fetch: fetchOndeVender }],
  },
  {
    file: 'premiumizacao.html',
    targets: [{ varName: 'D', fetch: fetchPremiumizacao }],
  },
  {
    file: 'ficha.html',
    targets: [
      { varName: 'D', fetch: (client) => getAnoAtualFicha(client).then((ano) => fetchFicha(client, ano)) },
      { varName: 'CAMBIO', fetch: (client) => getAnoAtualFicha(client).then((ano) => fetchCambioFicha(client, ano)) },
    ],
  },
  {
    // Acrescentado 2026-09-17, validado contra a base real. Ver caveat
    // no topo do ficheiro para o detalhe das fontes de cada bloco.
    file: 'balanca.html',
    targets: [
      { varName: 'BAL', fetch: fetchBalancaBAL },
      { varName: 'ES', fetch: fetchBalancaES },
      { varName: 'CATS', fetch: fetchBalancaCATS },
      { varName: 'PAISES', fetch: fetchBalancaPAISES },
    ],
  },
];

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Falta a variável de ambiente DATABASE_URL (looker_ro).');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    console.log('A exportar dados do Supabase para o site VineAtlas...\n');
    for (const page of PAGES) {
      console.log(`-> ${page.file}`);
      for (const target of page.targets) {
        const data = await target.fetch(client);
        replaceConst(page.file, target.varName, data);
      }
    }
    console.log('\nConcluído. Reveja o diff antes de dar commit.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Falhou a exportação:', err);
  process.exit(1);
});
