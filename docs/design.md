# 保守上の判断と制約

## 配信と認証

静的ファイルは Workers Static Assets で配信し、認証と閲覧者の制限は Cloudflare Access に任せる。
独自の認証画面やサーバー側アプリケーションを持たずに、指定したメールアドレスだけを許可するためである。

OTP は Google 側の設定が不要であり、利用手順では先に説明する。
Google ログインも選択可能とし、OAuth client の作成と認証情報の入力は利用者が行う。

[Worker destination](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-one-worker) は Worker に関連する URL をまとめて保護するために使う。
`worker` を使い、本番と preview の両方を常に保護する。
家族資料の本番公開につながる preview 専用の設定は提供しない。

## スクリプトを分ける理由

`scripts/configure-access.mjs` は引数の検証と、デプロイ済み Worker の Access 設定を扱う。
用途・サイト名・ログイン方法の聞き取りは Coding Agent が担当し、スクリプトは入力不足をエラーとして返す。
ファイルのアップロードは `npm run deploy` で行う。
閲覧者の変更時に資料をアップロードしないよう、設定と配信を分けている。
`scripts/verify.mjs` は公開済み URL を未認証で検証する。
設定を変更せずに検証だけを何度でも実行できるよう、二つを分けている。

Node.js 22 以降の標準 API を使い、デプロイにはプロジェクトでバージョンを固定した Wrangler を使う。
macOS、Linux、WSL を対象とし、Claude 向け指示は共通ファイルへの相対シンボリックリンクで共有する。

## 公開前の確認

初回は公開可能なサンプルを使う。
Access の HTTP 検証に加え、利用者が許可済みアドレスと許可対象外アドレスのブラウザ確認を終えてから実資料へ置き換える。
HTTP の転送確認だけでは、ログイン後に誰が閲覧できるかは分からない。

API token と OAuth credentials は環境変数で渡し、Agent は値を表示せずにスクリプトを実行する。
デプロイは Wrangler のブラウザ認証、Access の自動設定は対象アカウントに限定した API トークンを使う。
Access 用トークンに Workers の書き込み権限を含めず、デプロイ時はトークンの環境変数が OAuth を上書きしないようにする。
`scripts/configure-access-interactive.sh` は秘密値を非表示で読み取り、そのプロセス内で設定コマンドを実行する。
別ターミナルから起動済み Agent へ環境変数を引き継ぐ必要をなくすためである。
入力先を利用者が直接操作できない場合は、このコマンドだけを利用者のターミナルで実行し、Agent が検証を続ける。
OTP は許可対象外アドレスにはコードが届かないため、コードの不達だけで判断せず、許可者の設定も照合する。
コピー先は private で運用し、公開する場合は現在のファイルと Git 履歴を確認する。

## 既存リソースの更新

Identity Provider と policy は専用名で検索する。
application は名前だけでは更新せず、対象 Worker ID だけを持つ単一の `worker` destination と `self_hosted` 型を確認する。
同名でも別 Worker を指す場合や、複数の destination を持つ場合は、既存の保護対象を失わないよう変更前に停止する。
同じ検索条件に複数件一致した場合は、そのリソースの更新を中止する。

[Access の優先順位](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#understand-access-hierarchy)では、ホスト名・パスの設定が Worker の設定より優先される。
このスクリプトは全ルートとの重複を判定しないため、アカウント内にホスト名・パスを持つ self-hosted application がある場合や、対象形式を確認できない場合は、書き込み前に停止する。
無関係なサイトの設定も停止対象となる。既存設定を削除して回避せず、管理画面で全公開 URL に適用される application とポリシーを確認して設定する。
Worker、Identity Provider、application、policy の一覧は全ページを取得して確認する。

Worker 名から API で Worker ID を取得し、Access の destination に使う。
既存アプリケーションに管理対象外のポリシーがある場合は、設定を変更せずに停止する。
意図しない許可を残したり、利用者が別途設定したポリシーを消したりしないためである。

URL の検証では、指定されたパスの解決先が元のサイトと同じ origin であることを確認する。
別サイトへの転送結果を、対象サイトの保護が成功した証拠として扱わない。
