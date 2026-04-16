# abiemd
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.2-green.svg)
![Version](https://img.shields.io/badge/Language-JavaScript-yellow.svg)

## 概要
abiemd (ABATBeliever Easy MarkDown Editor) は、Web上で動作するMarkdownメモ帳です。  
公式のabiemdは[こちら！](https://abatbeliever.net/software/web/abiemd/)

<img width="1733" height="945" alt="image" src="https://github.com/user-attachments/assets/ec777915-7e10-4a92-b3ef-e4e421d1807c" />

## 特徴
- 画像挿入に対応(Base64)
- markedが対応する範囲でMarkdownに対応
- KaTeXによる、LaTeX構文のサポート
- リアルタイムの反映
- markdown(.md) / 画像(.png) / PDF(.pdf) / 印刷(.pdf)での出力
- markdown(.md) / LocalStorageでのロード
- チェックできるチェックリスト
- すべてがローカル上で処理される
- LocalStorageによる自動保存
- 依存関係まで含めMITライセンス

## 依存関係
- html2canvas
- jspdf
- katex
- marked

## 注意点
- 画像挿入はbase64で実装しており、多くのmarkdownエディタでは開けないかもしれません
- 文字の改行をabiemdではすべて改行としますが、多くのmarkdownエディタでは空白x2がないと1行になります
- Windowsメモ帳がサポートしない構文を含みます
- 各種依存関係は直接含んでいます。フォークしたい場合はCDNを利用したほうがいいかもしれません。
