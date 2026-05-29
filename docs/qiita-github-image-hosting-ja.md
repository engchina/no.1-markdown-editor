# No.1 Markdown Editor の GitHub Image Hosting を解説する: local 画像を Qiita にそのまま貼れる URL に変換する

## 先に結論

`No.1 Markdown Editor` の GitHub Image Hosting は、Markdown 内の local image reference を探し、画像 file を GitHub repository に upload し、その Markdown を public URL に書き換える仕組みです。

ここが大事です。

**Qiita に貼りたい Markdown を、Qiita 側の画像 upload 操作に依存せず、editor 側で GitHub hosted image URL に変換します。**

たとえば、記事を書いている Markdown に次のような local image があるとします。

```md
# GitHub Image Hosting

![screen](./images/screen.png)
![diagram](../assets/flow.JPG "upload flow")
![remote](https://example.com/already-remote.png)
```

Image Hosting を実行すると、local image だけが upload され、Markdown は次のような形になります。

```md
# GitHub Image Hosting

![screen](https://cdn.jsdelivr.net/gh/engchina/markdown-images@main/images/2026/05/screen-github-image-hosting-1716894000-1.png)
![diagram](https://cdn.jsdelivr.net/gh/engchina/markdown-images@main/images/2026/05/flow-github-image-hosting-1716894000-2.jpg "upload flow")
![remote](https://example.com/already-remote.png)
```

この状態なら、そのまま Qiita の editor に貼れます。

Qiita は Markdown 記法を使えるので、`![alt](url)` の形になっていれば画像として扱えます。Qiita Markdown は GitHub Flavored Markdown を基本にしており、link / image は途中で改行しないことが重要です。

この記事では、この local image -> GitHub hosted URL 変換を、実装コードで分解します。

この記事のコードは `v0.21.0` / commit `70ad6de` の実装をもとにしています。

## この記事で分かること

- Markdown 内の local image だけを検出する方法
- relative path を現在の document path から absolute path に解決する方法
- GitHub に置く remote filename を衝突しにくい形で作る方法
- Tauri / Rust 側で GitHub Contents API に upload する方法
- upload 後に Markdown を Qiita で使える URL に書き換える方法
- 失敗した画像だけを元のまま残す理由
- PAT と public repository の扱いをどう安全側に倒しているか
- この機能を test でどう守っているか

## 対象読者

- Qiita 記事用の screenshot 管理を楽にしたい方
- Markdown editor に image hosting を組み込みたい方
- Tauri app から GitHub API を呼びたい方
- local file path と Markdown image syntax の扱いに悩んでいる方
- 「書いた Markdown をそのまま Qiita に貼る」workflow を作りたい方

## まず、ユーザー体験

ユーザーから見ると、操作はかなり短いです。

1. Markdown file を保存しておく
2. local image を貼る
3. GitHub Image Hosting の設定をする
4. upload command を実行する
5. Markdown 内の local image が public URL に置き換わる
6. Markdown を Qiita に copy & paste する

設定で持つ情報は、だいたい次のようなものです。

```txt
owner: engchina
repo: markdown-images
branch: main
directory: images
PAT: GitHub repository contents read/write
```

実行前:

```md
![hero](./images/hero.png)
```

実行後:

```md
![hero](https://cdn.jsdelivr.net/gh/engchina/markdown-images@main/images/2026/05/hero-post-1716894000-1.png)
```

GitHub repository に画像 file が入り、Markdown には public URL だけが残ります。

この Markdown は Qiita にそのまま貼れます。

## 全体像

処理は 1 箇所では完結していません。

```txt
Toolbar / Command Palette
  -> triggerImageHostingUploadForActiveDocument()
    -> runImageHostingUploadForDocument()
      -> replaceLocalImagesWithRemoteUrls()
        -> resolveAbsoluteLocalPath()
        -> buildRemoteFilename()
        -> uploadImageToHosting()
          -> Tauri invoke image_hosting_upload
            -> Rust: GitHub Contents API
              -> cdn.jsdelivr.net / raw.githubusercontent.com URL
      -> updateTabContent(rewrittenMarkdown)
```

中心になる file は次の通りです。

- `src/lib/imageHosting/urlBuilder.ts`
- `src/lib/imageHosting/replaceLocalImages.ts`
- `src/lib/imageHosting/runUpload.ts`
- `src/lib/imageHosting/triggerUpload.ts`
- `src/lib/imageHosting/client.ts`
- `src-tauri/src/image_hosting.rs`
- `src/store/imageHosting.ts`
- `tests/imageHosting-urlBuilder.test.ts`
- `tests/imageHosting-replaceLocalImages.test.ts`
- `tests/imageHosting-i18n-completeness.test.ts`

## 1. local image と remote image を分ける

最初に必要なのは、Markdown の image destination が local かどうかを判断することです。

```ts
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

const REMOTE_URL_PATTERN = /^(?:https?:|data:|file:|\/\/)/i

export function isLocalImageReference(destination: string): boolean {
  const trimmed = destination.trim()
  if (trimmed.length === 0) return false
  return !REMOTE_URL_PATTERN.test(trimmed)
}

export function hasSupportedImageExtension(source: string): boolean {
  return IMAGE_EXTENSION_PATTERN.test(source)
}
```

この段階では、次のものは upload 対象にしません。

- `https://example.com/a.png`
- `data:image/png;base64,...`
- `file:///C:/...`
- `//cdn.example.com/a.png`
- `./not-image.txt`

つまり、すでに remote URL になっている画像や、画像ではない attachment はそのまま残します。

この割り切りが重要です。

Image Hosting は「全部を upload する」機能ではなく、**Qiita でそのまま表示できない local Markdown image だけを public URL に変換する**機能です。

## 2. GitHub に置く filename を決める

GitHub repository に画像を置くとき、元 file name をそのまま使うと衝突しやすくなります。

そのため、実装では次の要素から remote filename を作ります。

- UTC の `yyyy/mm`
- 元画像の basename
- document name
- batch id
- image index
- extension

```ts
export function buildRemoteFilename(input: BuildRemoteFilenameInput): string {
  const now = input.now ?? new Date()
  const year = now.getUTCFullYear().toString().padStart(4, '0')
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0')

  const extension = extractImageExtension(input.sourcePath) || '.png'

  const documentSlug = sanitizeSlug(input.documentName ?? 'document')
  const baseName = sanitizeSlug(stripExtension(basename(input.sourcePath)) || 'image')

  const stem = baseName.length > 0 ? baseName : 'image'
  const suffix = `${documentSlug}-${input.batchId}-${input.index}`

  return `${year}/${month}/${stem}-${suffix}${extension}`
}
```

たとえば次の入力なら、

```txt
sourcePath: /Users/me/notes/image/Screenshot 2026.png
documentName: My Article
batchId: 1716894000
index: 3
date: 2026-05-28
```

出力はこうなります。

```txt
2026/05/screenshot-2026-my-article-1716894000-3.png
```

GitHub repository 側では、月別 directory に自然にまとまります。

```txt
images/
  2026/
    05/
      screenshot-2026-my-article-1716894000-3.png
```

後から見たときに、どの記事から upload された画像かも追いやすくなります。

## 3. Markdown を走査して local image だけを upload する

中心の処理は `replaceLocalImagesWithRemoteUrls()` です。

```ts
const MARKDOWN_IMAGE_PATTERN =
  /!\[(?<alt>(?:\\.|[^\]])*)\]\(\s*(?:<(?<destinationBracketed>[^>\r\n]+)>|(?<destinationBare>[^\s)]+))(?<title>\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?\s*\)/g

export async function replaceLocalImagesWithRemoteUrls(
  options: ReplaceLocalImagesOptions
): Promise<ReplaceLocalImagesReport> {
  const matches = Array.from(options.markdown.matchAll(MARKDOWN_IMAGE_PATTERN))
  const report: ReplaceLocalImagesReport = {
    rewrittenMarkdown: options.markdown,
    uploaded: [],
    skipped: [],
    failed: [],
  }
  if (matches.length === 0) return report

  const batchId = options.batchId ?? Date.now()
  const replacements: Replacement[] = []
  let index = 0

  for (const match of matches) {
    const rawDestination = extractDestination(match)
    if (!rawDestination) continue

    if (!isLocalImageReference(rawDestination)) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'remote' })
      continue
    }

    if (!hasSupportedImageExtension(rawDestination)) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'unsupported' })
      continue
    }

    const resolvedPath = options.resolveLocalPath(rawDestination, options.documentPath)
    if (!resolvedPath) {
      report.skipped.push({ sourcePath: rawDestination, reason: 'unresolved' })
      continue
    }

    index += 1
    const remoteFilename = buildRemoteFilename({
      sourcePath: resolvedPath,
      documentName: options.documentName,
      batchId,
      index,
      now: options.now,
    })

    try {
      const result = await options.uploader({ localPath: resolvedPath, remoteFilename })
      const alt = match.groups?.alt ?? ''
      const titleSuffix = match.groups?.title ?? ''
      replacements.push({
        from: match.index ?? 0,
        to: (match.index ?? 0) + match[0].length,
        value: `![${alt}](${result.url}${titleSuffix})`,
      })
      report.uploaded.push({ sourcePath: resolvedPath, remoteUrl: result.url })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      report.failed.push({ sourcePath: resolvedPath, error: message })
    }
  }

  if (replacements.length === 0) return report

  report.rewrittenMarkdown = applyReplacements(options.markdown, replacements)
  return report
}
```

この関数がやっていることは、かなり実務的です。

1. Markdown image syntax だけを拾う
2. remote / unsupported / unresolved を skip する
3. local path を解決する
4. remote filename を作る
5. upload する
6. upload 成功分だけ Markdown を置換する
7. 失敗分は元 Markdown のまま残す

失敗した画像まで消したり、壊れた URL に置き換えたりしません。

Qiita に貼る記事では、画像が 1 枚でも壊れると読みにくくなります。だから upload できたものだけを置換し、できなかったものはユーザーが再試行できるように残します。

## 4. relative path を absolute path に解決する

Markdown では、多くの場合 local image は relative path です。

```md
![screen](./images/screen.png)
```

upload するには、実際の file system path が必要です。

```ts
export function resolveAbsoluteLocalPath(
  rawDestination: string,
  documentPath: string | null
): string | null {
  const cleaned = stripUrlNoise(rawDestination)
  if (!cleaned) return null

  const normalized = cleaned.replace(/\\/g, '/')
  if (isAbsolutePath(normalized)) {
    return normalizeSegments(normalized)
  }

  if (!documentPath) return null

  const docDir = directoryOf(documentPath.replace(/\\/g, '/'))
  if (!docDir) return null

  return normalizeSegments(`${docDir}/${normalized}`)
}
```

この処理で、次のように解決できます。

```txt
document: /workspace/notes/article.md
image:    ./image/1.png
result:   /workspace/notes/image/1.png
```

`?foo=bar#frag` のような query / hash は file system path ではないので削ります。

Windows path も `/` に寄せます。

```txt
C:\workspace\img.png
-> C:/workspace/img.png
```

Markdown editor は Windows / macOS / Linux を扱うので、path normalization は地味ですが重要です。

## 5. 実行入口は document 単位にする

upload は active document に対して実行します。

```ts
export async function runImageHostingUploadForDocument(
  input: RunImageHostingUploadInput
): Promise<RunImageHostingUploadOutcome> {
  if (!input.markdown.trim()) {
    return { kind: 'no-document', message: 'Document is empty' }
  }
  if (!input.documentPath) {
    return {
      kind: 'unsaved-document',
      message: 'Save the document to disk before uploading images',
    }
  }

  const state = await loadImageHostingState().catch(() => null)
  if (!isImageHostingReady(state)) {
    return {
      kind: 'not-configured',
      message: 'Image hosting is not enabled or PAT is missing',
    }
  }

  const report = await replaceLocalImagesWithRemoteUrls({
    markdown: input.markdown,
    documentPath: input.documentPath,
    documentName: input.documentName,
    resolveLocalPath: (rawDestination, documentPath) =>
      resolveAbsoluteLocalPath(rawDestination, documentPath),
    uploader: async ({ localPath, remoteFilename }) =>
      uploadImageToHosting(localPath, remoteFilename),
  })

  if (report.uploaded.length === 0 && report.failed.length === 0) {
    return {
      kind: 'no-local-images',
      message: 'No local images to upload',
    }
  }

  return {
    kind: 'completed',
    rewrittenMarkdown: report.rewrittenMarkdown,
    uploadedCount: report.uploaded.length,
    failedCount: report.failed.length,
    skippedCount: report.skipped.length,
    report,
  }
}
```

ここで未保存 document を止めているのは、relative image path を正しく解決できないからです。

`./images/a.png` は、document path が分からないと実体の file path に変換できません。

そのため、先に保存してもらいます。

この制約は少し厳しく見えますが、画像 upload のように file system を触る機能では正しい制約です。

## 6. Frontend は document を置き換えるだけにする

UI 入口では、active tab の snapshot を取り、upload 結果に応じて notice を出します。

```ts
export async function triggerImageHostingUploadForActiveDocument(): Promise<void> {
  const state = useEditorStore.getState()
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null

  if (!activeTab) {
    pushInfoNotice(
      'imageHosting.notices.noDocumentTitle',
      'imageHosting.notices.noDocumentMessage'
    )
    return
  }

  const snapshot = {
    id: activeTab.id,
    content: activeTab.content,
    path: activeTab.path ?? null,
    name: activeTab.name ?? null,
  }

  const outcome = await runImageHostingUploadForDocument({
    markdown: snapshot.content,
    documentPath: snapshot.path,
    documentName: snapshot.name,
  })

  if (outcome.kind === 'completed') {
    if (outcome.rewrittenMarkdown !== snapshot.content) {
      useEditorStore.getState().updateTabContent(snapshot.id, outcome.rewrittenMarkdown)
    }
  }
}
```

実際の code では、`not-configured`、`unsaved-document`、`no-local-images`、`uploadPartial` などの notice も分けています。

ここで大事なのは、Frontend は upload の詳細を知らないことです。

Frontend の責務は、

- active document を選ぶ
- upload を開始する
- 返ってきた Markdown で tab content を更新する
- ユーザーに結果を出す

だけです。

GitHub API、PAT、base64 encoding、repository permission は Rust 側に閉じ込めています。

## 7. Tauri bridge は小さく保つ

Frontend から Rust command を呼ぶ layer は薄いです。

```ts
export async function uploadImageToHosting(
  localPath: string,
  remoteFilename: string
): Promise<ImageHostingUploadResult> {
  assertDesktopAvailable()
  return invoke<ImageHostingUploadResult>('image_hosting_upload', {
    localPath,
    remoteFilename,
  })
}
```

この `assertDesktopAvailable()` により、GitHub Image Hosting は desktop app 専用になります。

Browser fallback で PAT を扱うより、Tauri desktop の Rust 側に寄せた方が安全です。

PAT は JavaScript の localStorage に置かず、Rust 側で keyring に保存します。

## 8. Rust 側で GitHub Contents API に upload する

本体は `src-tauri/src/image_hosting.rs` です。

設定は app local data に保存し、PAT は keyring に保存します。

```rust
const IMAGE_HOSTING_CONFIG_FILE: &str = "image-hosting.json";
const IMAGE_HOSTING_KEYRING_SERVICE: &str = "com.no1.markdown-editor.image-hosting";
const IMAGE_HOSTING_PAT_ACCOUNT: &str = "github-pat";
const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
```

upload では local file を読み、base64 にして、GitHub Contents API の `PUT /repos/{owner}/{repo}/contents/{path}` に投げます。

```rust
#[tauri::command]
pub async fn image_hosting_upload<R: Runtime>(
    app: AppHandle<R>,
    local_path: String,
    remote_filename: String,
) -> Result<ImageHostingUploadResult, String> {
    let config = read_image_hosting_config(&app)?
        .ok_or_else(|| "Image hosting is not configured".to_string())?;
    if !config.enabled {
        return Err("Image hosting is disabled".to_string());
    }

    let pat = read_image_hosting_pat()?;
    let bytes = std::fs::read(&local_path)
        .map_err(|error| format!("Failed to read local image: {error}"))?;
    let encoded = BASE64_STANDARD.encode(&bytes);

    let safe_filename = sanitize_remote_filename(&remote_filename)?;
    let remote_path = if config.directory.is_empty() {
        safe_filename.clone()
    } else {
        format!("{}/{}", config.directory.trim_matches('/'), safe_filename)
    };

    let commit_message = config
        .commit_message_template
        .replace("{filename}", &safe_filename);

    let url = format!(
        "{}/repos/{}/{}/contents/{}",
        GITHUB_API_BASE, config.owner, config.repo, remote_path
    );
    let body = json!({
        "message": commit_message,
        "content": encoded,
        "branch": config.branch,
    });

    // reqwest PUT ...
}
```

GitHub の Contents API は、file content を base64 で渡します。

この設計にすると、Frontend から binary を GitHub に直接送らずに済みます。

また、commit message template を持たせているので、GitHub repository 側にも upload の履歴が残ります。

```txt
Upload image: 2026/05/screen-post-1716894000-1.png
```

## 9. Qiita に貼る URL を作る

upload が成功すると、Rust 側では 2 種類の URL を作っています。

```rust
let cdn_url = build_jsdelivr_url(&config.owner, &config.repo, &config.branch, &remote_path);
let raw_url = build_raw_github_url(&config.owner, &config.repo, &config.branch, &remote_path);

Ok(ImageHostingUploadResult {
    url: cdn_url,
    raw_url,
    remote_path,
    commit_sha,
})
```

URL builder はこうです。

```rust
fn build_jsdelivr_url(owner: &str, repo: &str, branch: &str, path: &str) -> String {
    format!("https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}")
}

fn build_raw_github_url(owner: &str, repo: &str, branch: &str, path: &str) -> String {
    format!("https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}")
}
```

`raw_url` は GitHub の raw URL です。

```txt
https://raw.githubusercontent.com/engchina/markdown-images/main/images/2026/05/screen.png
```

実際に Markdown に入れる `url` は jsDelivr CDN URL です。

```txt
https://cdn.jsdelivr.net/gh/engchina/markdown-images@main/images/2026/05/screen.png
```

どちらも GitHub repository 上の file を公開する URL ですが、記事に貼る Markdown としては CDN URL を使う設計になっています。

Qiita で使う Markdown は、最終的にこうなります。

```md
![screen](https://cdn.jsdelivr.net/gh/engchina/markdown-images@main/images/2026/05/screen-post-1716894000-1.png)
```

## 10. repository verify では public と push permission を見る

画像 URL は Qiita の読者からアクセスできる必要があります。

そのため、verify では repository が private ではないこと、PAT が push できることを見ています。

```rust
let private = body
    .get("private")
    .and_then(serde_json::Value::as_bool)
    .unwrap_or(false);
let can_push = body
    .get("permissions")
    .and_then(|p| p.get("push"))
    .and_then(serde_json::Value::as_bool)
    .unwrap_or(false);

if private {
    return Err(
        "Repository is private. Image URLs require a public repository to be accessible."
            .to_string(),
    );
}
if !can_push {
    return Err(
        "The PAT does not have Contents: Read and write permission on this repository."
            .to_string(),
    );
}
```

ここは妥協しない方がいいところです。

private repository に upload できても、Qiita の読者には見えません。

PAT が read-only なら upload できません。

だから、設定画面で owner / repo / branch / directory / PAT を入れた後に verify します。

## 11. remote filename は path traversal を拒否する

upload 先 path は外部 API に渡すので、sanitize が必要です。

```rust
fn sanitize_remote_filename(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Remote filename cannot be empty".to_string());
    }
    if trimmed.starts_with('/') || trimmed.contains("..") {
        return Err(
            "Remote filename must be a relative path without parent references".to_string(),
        );
    }
    if trimmed.chars().any(|c| matches!(c, '\\' | '\0')) {
        return Err("Remote filename contains invalid characters".to_string());
    }
    Ok(trimmed.trim_matches('/').to_string())
}
```

`../etc/passwd` のような parent traversal、absolute path、backslash、null byte は拒否します。

GitHub repository 内の path とはいえ、ここを緩くすると後で管理しにくくなります。

## 12. 置換は後ろから適用する

Markdown を複数箇所置換するとき、前から置換すると index がずれます。

そのため、置換は後ろから適用します。

```ts
function applyReplacements(markdown: string, replacements: Replacement[]): string {
  let output = markdown
  for (const replacement of [...replacements].reverse()) {
    output = output.slice(0, replacement.from) + replacement.value + output.slice(replacement.to)
  }
  return output
}
```

これは小さい code ですが、Markdown rewriting ではかなり大事です。

AST を使う選択肢もありますが、この機能では Markdown image syntax だけを対象にしており、alt / title / destination の範囲も regex で明確に取っています。

そのため、置換範囲を持って reverse apply する実装で十分に扱えます。

## 13. Test で守っている contract

`urlBuilder` の test では、remote 判定、local 判定、extension、filename の format を確認しています。

```ts
test('isLocalImageReference rejects remote schemes', () => {
  assert.equal(isLocalImageReference('https://example.com/x.png'), false)
  assert.equal(isLocalImageReference('http://example.com/x.png'), false)
  assert.equal(isLocalImageReference('data:image/png;base64,AAA='), false)
  assert.equal(isLocalImageReference('//cdn.example.com/x.png'), false)
  assert.equal(isLocalImageReference('file:///C:/x.png'), false)
})

test('buildRemoteFilename builds yyyy/mm grouped slugged filename', () => {
  const now = new Date(Date.UTC(2026, 4, 28, 10, 0, 0))
  const name = buildRemoteFilename({
    sourcePath: '/Users/me/notes/image/Screenshot 2026.png',
    documentName: 'My Article',
    batchId: 1716894000,
    index: 3,
    now,
  })
  assert.match(name, /^2026\/05\/screenshot-2026-my-article-1716894000-3\.png$/)
})
```

`replaceLocalImages` の test では、local image だけ upload され、remote image と non-image は skip されることを確認しています。

```ts
const markdown = [
  '# Title',
  '',
  '![one](./image/1.png "title one")',
  '![two](image/2.JPG)',
  '![remote](https://example.com/x.png)',
  '![doc](./not-image.txt)',
  '',
  'End.',
].join('\n')

const report = await replaceLocalImagesWithRemoteUrls({
  markdown,
  documentPath: '/workspace/notes/article.md',
  documentName: 'article.md',
  batchId: 1700,
  now: FIXED_NOW,
  resolveLocalPath: (raw, docPath) => resolveAbsoluteLocalPath(raw, docPath),
  uploader: async ({ localPath, remoteFilename }) => {
    uploads.push({ localPath, remoteFilename })
    return { url: `https://cdn.example.com/${remoteFilename}` }
  },
})

assert.equal(report.uploaded.length, 2)
assert.equal(report.failed.length, 0)
assert.equal(
  report.skipped.filter((entry) => entry.reason === 'remote').length,
  1
)
assert.equal(
  report.skipped.filter((entry) => entry.reason === 'unsupported').length,
  1
)
```

失敗時の contract も test しています。

```ts
assert.match(report.rewrittenMarkdown, /!\[ok\]\(https:\/\/cdn\.example\.com\/ok\.png\)/)
assert.match(report.rewrittenMarkdown, /!\[bad\]\(\.\/b\.png\)/, 'failed image stays untouched')
```

つまり、upload に失敗した画像は壊さない。

この動きは、記事作成 workflow ではかなり重要です。

## 14. なぜ Qiita upload ではなく GitHub repository に寄せるのか

Qiita にも画像 upload 機能はあります。

ただ、Markdown editor 側で文章を書いていると、次の作業が発生しがちです。

```txt
画像を貼る
Qiita に upload する
URL を copy する
Markdown の local path を差し替える
別の画像でも同じことを繰り返す
```

この繰り返しは、記事が長くなるほど面倒です。

GitHub Image Hosting に寄せると、Markdown source 側で次のように完結できます。

```txt
画像を貼る
upload command を実行する
Markdown が public URL に変わる
Qiita に貼る
```

さらに、画像 repository に履歴が残るので、記事用 asset を GitHub 側で管理できます。

## 15. 実装の要点

この機能の要点は、単に GitHub に upload することではありません。

### local image だけを対象にする

すでに remote URL の画像はそのまま残します。

Qiita で使える URL を、もう一度 upload する必要はありません。

### Markdown を壊さない

upload 成功分だけ Markdown を置換します。

失敗した image reference は元のまま残します。

### path は document から解決する

relative image path は、document path がないと解決できません。

だから unsaved document は upload 前に止めます。

### PAT は Rust / keyring 側に置く

GitHub PAT は browser storage に置かず、desktop app の keyring に保存します。

### public repository を前提にする

Qiita に貼る画像 URL は、読者から見えなければ意味がありません。

だから private repository は verify で拒否します。

## この記事の要点を 3 行でまとめると

1. GitHub Image Hosting は、Markdown 内の local image を検出し、GitHub repository に upload して、Qiita に貼れる public URL に書き換える機能です。
2. 実装は `replaceLocalImagesWithRemoteUrls()`、`buildRemoteFilename()`、`image_hosting_upload` の 3 層に分かれ、Markdown rewriting と GitHub API upload を明確に分離しています。
3. PAT は keyring、repository は public、upload 成功分だけ置換、失敗分は元のまま、という制約により、記事執筆 workflow を壊さずに自動化しています。

## 参考

- [Qiita Markdown](https://help.qiita.com/ja/articles/qiita-markdown)
- [Qiita 画像のアップロード・削除方法](https://help.qiita.com/ja/articles/qiita-image-upload)
- [GitHub REST API: Create or update file contents](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)

