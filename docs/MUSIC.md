# 🎵 Música — Lidarr + FLAC

Estado do módulo de música: o **stack está montado e a funcionar**, e o Blackbear já
fala com o Lidarr (Fase 1). O resto está por fazer.

---

## O stack, como ficou (Mac mini, 2026-09-14)

| Peça | Valor |
|---|---|
| Lidarr | `http://192.168.1.134:8686`, container `lidarr`, no compose `~/servarr/docker-compose.yml` |
| Root folder | `/data/Music` → `/Volumes/ALBATROZ/Music` |
| Mount | `/Volumes/ALBATROZ:/data`, igual ao Radarr/Sonarr → **hardlinks funcionam** |
| Download client | qBittorrent, categoria `music` → `/data/torrents/music` |
| Quality profile | `FLAC` — Lossless + High-Quality-Lossy, cutoff no grupo Lossless, upgrades on |
| Metadata profiles | `Standard` (Album + EP) e `Album + Compilacoes` (acrescenta coletâneas) |
| Naming | `{Artist}/{Album} ({Year})/{track:00} - {Title}`, multi-disco em `CD 01/` |
| Prowlarr | app Lidarr, `addOnly`, categorias de áudio (3000/3010/3030/3040/3050/3060) |

### Duas decisões que não são óbvias

**O Portugas está com guarda.** O indexer sincroniza para o Lidarr (tem categorias de
áudio) mas está *tagged* `portugas` lá dentro, por isso só é consultado para artistas que
levem essa tag — mesma mecânica que já protege o Radarr/Sonarr de Hit & Run. Um artista
só chega ao Portugas se alguém o marcar de propósito.

**O 24-bit ranqueia abaixo do FLAC 16/44.** Na ordem nativa dos \*arr o `FLAC 24bit` ficava
acima do `FLAC`, o que levava o Lidarr a preferir rips de 2.6 GB (quase sempre upsampling)
em vez dos 380 MB do 16/44. A ordem do grupo Lossless foi invertida para
`ALAC 24bit < FLAC 24bit < WavPack < APE < ALAC < FLAC`.

### O que aprendemos no primeiro grab

Os **seeders anunciados pelos indexers públicos não são de confiar** para música antiga.
O release escolhido para "Money for Nothing" dizia 38 seeders; o swarm real tinha 5, com
metade dos trackers extintos (`h33t.com`, `coppersurfer.tk`, `leechers-paradise`). Filmes
recentes não têm este problema; música de catálogo tem-no quase sempre. É o argumento mais
forte para o Soulseek (slskd) como fonte complementar.

Cobertura medida: catálogo internacional bem servido (≈45 resultados FLAC para *OK
Computer*), música portuguesa quase nua (1 resultado FLAC, 1 seeder, para os Xutos) — onde
o Portugas é que é a resposta.

---

## Validado end-to-end (2026-09-15)

Primeiro álbum a percorrer a cadeia toda — *Money for Nothing*, dos Dire Straits:
grab → qBittorrent → import → **hardlink** (`nlink=2`, a pasta do torrent ocupa 40 K) →
`Dire Straits/Money for Nothing (1988)/01 - Sultans of Swing.flac`, 12/12 faixas, 381 MB,
FLAC 16/44. Demorou ~7 h por causa do swarm morto, não da configuração.

## Fases no Blackbear

- [x] **Fase 1 — ligação.** `services/lidarr.js`, entrada no `config.js`, probe em
      Diagnostics, card em Settings, fila do Lidarr em `/api/downloads`.
- [x] **Fase 2 — biblioteca de música.** Álbuns na Library com associação ao torrent,
      apagamento em cascata e as mesmas guardas (Portugas, HnR, hardlinks).
- [x] **Fase 3 — adicionar música.** Modo "Music" na procura, com o *metadata profile*
      exposto no painel de adicionar.
- [x] **Fase 4 — extras.** Secção "Albums" no Upcoming (em falta + a caminho), com
      Search / Renew / Pick. O refresh do Jellyfin já era coberto: o `/Library/Refresh`
      que o apagamento dispara varre todas as bibliotecas, música incluída.

### O que a Fase 2 revelou

1. **`eventType` do import — confirmado.** Contra o import real do primeiro álbum:
   `1 → grabbed`, `3 → trackFileImported` (um por faixa), `8 → downloadImported` (um por
   release). A Library quer o **3**, não o 8: só os registos por faixa dizem em que álbum
   o ficheiro aterrou.
   **E era mesmo uma armadilha:** o `IMPORT_EVENT` da Library só conhecia
   `downloadFolderImported`, por isso descartava silenciosamente *todos* os registos de
   música — os álbuns apareciam sem torrent nenhum. Corrigido e com teste.
2. **Apagar música não tem a forma de apagar um filme.** O registo do álbum é metadata
   pendurada no artista, e o Lidarr recria-o no refresh seguinte a partir do MusicBrainz —
   apagá-lo seria teatro. O que se apaga são os *track files*, depois de desmonitorizar
   (senão o Lidarr volta a agarrar o álbum). O artista fica, com o resto da discografia
   intacta. Por isso também não há "import exclusion" para álbuns: a opção é escondida em
   vez de aparecer a não fazer nada.
3. **`/trackfile` recusa pedidos sem filtro** (`artistId`, `albumId`, `trackFileIds` ou
   `unmapped`). A varredura da Library pergunta uma vez por artista com ficheiros — bem
   menos chamadas do que uma por álbum.

### O que as Fases 3 e 4 revelaram

1. **`wanted/missing` ignora álbuns cujo artista não está monitorizado.** Podes monitorizar
   um álbum e ele não aparece em lado nenhum, porque o Lidarr filtra primeiro pelo
   artista. Confirmado empiricamente: com o artista a `false`, `totalRecords: 0`; a
   `true`, o mesmo álbum aparece.
2. **O Lidarr devolve caminhos locais para arte de itens já na biblioteca**
   (`/config/MediaCover/1/poster.jpg` em vez de um URL). O browser tentava carregá-los da
   própria app e mostrava uma imagem partida. Agora só URLs absolutos contam, e o resto
   cai no ícone — em `lib/format.js` (`artwork`), `services/library.js` e `pipeline.js`.
3. **Um `npm run build` que passa não prova nada sobre identificadores em falta.** Um
   `import` esquecido (`Disc3`) compilou sem queixa e rebentou como `ReferenceError` só
   ao abrir a página. Foi apanhado no browser, não no build.

### Ainda por resolver

1. **Torrent-discografia.** A unidade natural é o álbum, mas um torrent traz muitas vezes
   a discografia inteira — um hash com N donos. O `hashOwners` já modela isto; falta a UI
   dizer em voz alta que apagar um álbum não liberta o torrent.
2. **Títulos mal formados.** O 1337x devolve `Artista   Álbum` com espaços duplos em vez de
   hífens, o que atrapalha o parser do Lidarr. Contar com imports manuais.

---

## Por montar fora do repo

- Biblioteca **Music** no Jellyfin apontada a `/Volumes/ALBATROZ/Music` (só vale a pena
  depois do primeiro álbum aterrar).
- **Autenticação no Lidarr** — arrancou sem nenhuma, ao contrário dos outros \*arr.
- Partilha **SMB** de `Music` para o streamer da aparelhagem (o WiiM e afins não falam
  Jellyfin; falam SMB/UPnP).
- **ReplayGain** nas tags (`beets replaygain` ou Picard) — sem isso o volume salta entre
  álbuns.
- **Backup** da pasta Music: música de catálogo não se re-descarrega tão facilmente como
  filmes, e é pequena (≈350 MB por álbum FLAC).
