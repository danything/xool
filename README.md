# xool

## 開発環境

traefik環境を先に構築しておく下記参照  
<https://github.com/5ym/Local-Dev-Traefik>  
下記コマンドで立ち上げ

```sh
./s.sh i
```

### 各自の設定

`compose.yml` は全員共通で、直接編集しません。手元だけの設定は
`compose.override.yml` に書きます。Docker Compose が自動で読み込んで
`compose.yml` に重ねるため、起動コマンドは変わりません。このファイルは
gitignore してあります。

```yaml
# compose.override.yml
services:
  xool:
    environment:
      # 𝕏 のOAuthアプリ。コールバックは https://x.localhost/api/cb
      - CLIENT_ID=xxxxx
      - CLIENT_SECRET=xxxxx
      # OAuth の state に使う任意の文字列
      - HASH=xxxxx
      # LGTM (l.localhost) のGitHubログイン用。コールバックは
      # https://l.localhost/api/gh/cb 。無くても起動はします
      - GITHUB_CLIENT_ID=xxxxx
      - GITHUB_CLIENT_SECRET=xxxxx
      # /admin を開ける人。空なら誰も開けません
      - ADMIN_X_IDS=xxxxx
      - ADMIN_GH_LOGINS=xxxxx
```

重ねた結果は下記で確認できます。

```sh
docker compose config
```
