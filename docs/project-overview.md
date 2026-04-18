# Samether.io（サメザリオ）

## 一言で

**現実世界を歩いてサメを強くする、位置情報連動型リアルタイムマルチプレイヤーゲーム**

## コンセプト

Slither.io × ポケモン GO。スマホブラウザで海中のサメを操作し、エサを食べて成長・進化しながら他プレイヤーと競います。現実世界を歩くとゲーム内の「チャージポイント（CP）」が貯まり、ダッシュや特殊能力に使える仕組みで、ゲームプレイと実世界の移動を結びつけました。

## 主な機能

- **リアルタイム対戦** — WebSocket による 20tick/秒 のサーバー権威モデル。複数人が同時にプレイ可能
- **3 系統 × 5 段階の進化ツリー** — 攻撃系（→メガロドン）、非攻撃系（→ジンベエザメ）、深海魚系（→ニシオンデンザメ）から選択
- **GPS 連動 CP システム** — 現実の移動距離がゲーム内リソースに変換（Amazon Location Service）
- **領域システム** — サメの軌跡で海域を囲み、テリトリーを形成。弱いサメが強いサメの領域に入ると即死
- **ボット AI** — プレイヤーが少ない時間帯もゲーム体験を維持
- **Redis リーダーボード** — サーバー再起動後もランキングを永続化

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Phaser 3 + TypeScript + Vite |
| バックエンド | Go + gorilla/websocket |
| インフラ | AWS ECS Fargate + ALB + ElastiCache Redis |
| フロント配信 | S3 + CloudFront |
| 位置情報 | Amazon Location Service |
| IaC | Terraform |
| CI/CD | GitHub Actions + Dependabot |

## アーキテクチャ

```
[モバイルブラウザ]
       │
       ├─ HTTPS ──→ [CloudFront + S3]  (フロント配信)
       │
       └─ WSS ───→ [ALB] → [ECS Fargate (Go)] → [ElastiCache Redis]
                                    │
                              [Amazon Location Service]
```

## チーム構成（5 名）

| 担当 | 領域 |
|---|---|
| Person 1 | フロントエンド - ゲームコア（サメ描画・カメラ・入力） |
| Person 2 | フロントエンド - UI / 画面遷移 |
| Person 3 | バックエンド - ゲームロジック（ゲームループ・衝突判定・進化） |
| Person 4 | バックエンド - WebSocket 通信 / Redis / 領域システム |
| Person 5 | インフラ（AWS / Terraform / CI/CD） |

## 推しアイデア

- **「歩くほど強くなる」現実連動ループ** — 通勤・散歩がそのままゲーム内のリソース（CP）になる。歩いた分だけダッシュできる、という直感的なインセンティブ設計
- **サメの生態に忠実な進化バランス** — アオザメは最速だが燃費が悪い、シロワニは1日サバ1匹で満足するほど省エネ、ニシオンデンザメは400歳の最長寿。現実のサメの特性をそのままゲームメカニクスに落とし込んだ
- **弱者にもチャンスがある設計** — 鼻が弱点（現実のサメと同じ）なので、巨大なメガロドンでも小さなドチザメに鼻を突かれれば死ぬ。ジャイアントキリングが起こる

## 作った背景

5人全員がサメ好き。「サメのゲームを作りたい」から始まり、Slither.io の中毒性 × ポケモン GO の現実連動を掛け合わせたら面白いのでは、というアイデアに着地した。AWS ハッカソンなので Amazon Location Service を活用した位置情報連動を軸に据えた。

## 推し技術

- **Go + WebSocket のサーバー権威モデル** — 20tick/秒のゲームループを単一 goroutine のイベントループ（CSP パターン）で回すことで、ロック不要で安全な並行処理を実現
- **差分同期（Delta Sync）** — 毎 tick 全状態を送る代わりに、Added / Updated / Removed のみを送信。帯域を大幅に削減
- **Amazon Location Service × CP** — Tracker API でデバイス位置を蓄積 → 移動距離をサーバーで算出 → ゲーム内通貨に変換する、現実世界とゲームの橋渡しアーキテクチャ
- **Terraform による完全 IaC** — VPC / ECS Fargate / ALB / ElastiCache / CloudFront / ECR / GitHub OIDC まで全てコード管理。`terraform apply` 一発で環境再現可能

## デモ

https://d1tjd7svm6ovos.cloudfront.net

## リポジトリ

https://github.com/Qutalize/Samether.io
