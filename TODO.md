## 前提

- スマホ中心で使う
- 視点は固定、描画は SVG
- 箱と蓋は 1 種類ずつ、寸法は固定
- prototype/ はやりたいことを伝えるための試作で、仕様ではない
- 検討結果は docs/ に置く

## TODO

- [ ] commit-trailer の単体テストの追加（進め方と現在地は testlist.md）
- [x] ユースケースを整理する
    - [x] 使う人と使う場面を書き出す
    - [x] 場面ごとにやりたいことを洗い出す
    - [x] MVP に含めるユースケースを選ぶ（含めないものも明記する）
- [x] 情報設計を固める
    - [x] アプリで扱う情報（布、完成イメージなど）を洗い出す
    - [x] 情報どうしの関係と、保存が必要な情報を決める
    - [x] 画面一覧と遷移を決める
    - [x] 画面ごとに表示する情報と操作を決める
- [ ] 実装に入る前の準備
    - [x] スタイリング手段を決める → [docs/styling.md](docs/styling.md)
    - [x] デザインシステムを決める（色、文字、角丸、余白） → [docs/design-system.md](docs/design-system.md)
    - [ ] 画面ごとのデザインを決める
        - 文字の xs（12px）を残すか決める
    - [ ] shadcn/ui を導入する（Base UI）
        - [x] Tailwind CSS v4 を入れる（@tailwindcss/vite）
        - [x] Maia で init する → [docs/styling.md](docs/styling.md) の「初期化の手順」
        - [ ] Maia の値と docs/design-system.md を比べ、揃えられるものは Maia に揃える
            - [x] フォーカス、押したとき、ダイアログの要素の間、タブの外枠の内側を Maia に揃える
            - [ ] 見本の切り替えで比べて、残りを決める（まだ見本を見ていない）
                - 見本は `pnpm run dev` で起動し、/prototype/design-system.html を開く
                - 形と大きさ：角丸（ピル形）、高さ（36px か 48px）、ボタンの文字と余白、ダイアログの見出し
                - 色と影：削除のボタン、outline ボタンと入力欄の背景、選択中のタブ、ダイアログの影、暗幕
                - 表示状態のタブを 42px にした（外枠 48px を保つため）。46px の外枠でよければ 40px に戻す
            - [ ] 決まった値を docs/design-system.md に書き、見本の切り替えを消すか決める
        - [ ] CSS 変数を docs/design-system.md の値に置き換え、chart-* と sidebar-* を消す
            - init で入ったフォントの Figtree を、Zen Maru Gothic に置き換える
        - [ ] 最初に `shadcn add` したとき、src/components/ui/ がフォーマットの対象外になっているか確かめる
    - [ ] 使う部品を決める
    - [ ] boundaries に common を足し、参照の向きを縛る
        - routes と app は common を参照してよい
        - common は routes と app を参照しない
    - [ ] ホーム画面に追加して使えるようにする（PWA、オフライン対応の範囲も決める）
    - [ ] 空のアプリを先にデプロイし、実機で確かめられるようにする
    - [ ] 画面とルートの対応と、戻るボタンで閉じる挙動を決める
    - [x] 公開先、アクセスを身内に限るか、布の保存先（IndexedDB か Supabase か）を決める
