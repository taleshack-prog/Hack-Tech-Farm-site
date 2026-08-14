---
title: Por que o site da HTF não usa banco de dados
description: Um site institucional com dez produtos não precisa de Postgres. Explicamos a decisão técnica, o que ela custa e em que ponto ela deixaria de valer.
summary: Conteúdo versionado em Git e HTML gerado no build entregam SEO melhor, custo zero e histórico de alterações. O preço são 40 segundos entre publicar e ver no ar.
author: Heitor Hack
publishedAt: 2026-08-14
tags: [arquitetura, jamstack, seo]
status: published
---

Quando começamos o site institucional da Hack Tech Farm, a primeira proposta de arquitetura incluía Postgres, um servidor Express e um painel administrativo conversando com o banco em tempo real. Descartamos tudo isso. O site hoje não tem banco de dados, e a decisão melhorou três coisas ao mesmo tempo.

## O que o buscador realmente lê

Existe uma confusão comum: a de que o banco de dados alimenta o Google. Não alimenta. Nenhum crawler tem acesso ao seu Postgres. O que o Google, o ChatGPT e a Perplexity fazem é uma requisição HTTP no domínio e a leitura do HTML que volta.

Isso significa que a pergunta certa não é onde o conteúdo está guardado, mas **em que estado ele chega ao crawler**.

Um site que busca dados de um banco pelo navegador entrega HTML vazio e preenche depois com JavaScript. Muitos crawlers não executam JavaScript. Um site que gera HTML no momento do build entrega o conteúdo pronto na primeira resposta.

## Como funciona na prática

O catálogo de produtos vive num arquivo JSON versionado no repositório. Quando alguém publica pelo painel, uma função serverless grava o arquivo pela API do GitHub. O commit dispara um build, que reescreve as páginas HTML com o conteúdo novo.

| Aspecto | Com banco | Sem banco |
| --- | --- | --- |
| Tempo até refletir | imediato | cerca de 40 segundos |
| Custo mensal | plano do provedor | zero |
| Histórico de alterações | precisa configurar | cada commit é uma versão |
| Se o serviço cair | site perde o conteúdo | site continua no ar |

## O que isso custa

Quarenta segundos entre salvar e ver no ar. Para conteúdo institucional que muda uma vez por mês, é irrelevante. Para um painel de dados atualizado a cada minuto, seria inviável.

> A pergunta que decide não é "banco é melhor que arquivo", e sim "com que frequência isso muda e quem precisa ver a mudança na hora".

## Onde a decisão deixaria de valer

Três situações mudariam nossa escolha:

- **Dados por visitante.** Conta de usuário, carrinho, histórico pessoal. Nada disso cabe num arquivo versionado.
- **Volume alto.** Um catálogo com milhares de itens vira um JSON que o build precisa ler inteiro a cada deploy.
- **Consulta analítica.** Séries temporais e agregações são trabalho de SQL. Filtrar isso na memória é reimplementar um banco pior.

Nenhuma delas se aplica a um site institucional com quatro produtos no ar. Por isso a arquitetura mais simples também é, aqui, a mais rápida e a mais barata.

## Perguntas frequentes

### Um site sem banco de dados consegue ter área administrativa?

Sim. O painel grava o conteúdo em arquivos versionados pela API do provedor de repositório, e o build regenera as páginas. A diferença em relação a um painel tradicional é que a alteração leva alguns segundos para aparecer, em vez de ser instantânea.

### O buscador consegue ler um site gerado no build?

Sim, e com vantagem. O HTML já chega pronto na primeira resposta, sem depender de JavaScript. Sites que buscam dados no navegador entregam HTML vazio ao crawler, e nem todo crawler executa JavaScript.

### Quando um banco de dados passa a ser necessário?

Quando existem dados por visitante, como conta de usuário ou histórico pessoal, quando o volume de registros cresce a ponto de o build ficar lento, ou quando é preciso fazer consultas analíticas sobre séries temporais.
