"""
Claude Code Daily Slack Bot
毎朝8時（JST）に Claude Code のユースケースを生成して #times-izumi に投稿する
"""

import os
import sys
import traceback
from datetime import datetime, timezone, timedelta
import requests
import anthropic

# ── 設定 ──────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SLACK_BOT_TOKEN   = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL_ID  = os.environ["SLACK_CHANNEL_ID"]   # times-izumi のチャンネルID

JST = timezone(timedelta(hours=9))


# ── Claude API でユースケースを生成 ───────────────
def generate_use_cases() -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    today = datetime.now(JST).strftime("%Y年%-m月%-d日")

    prompt = f"""
あなたはClaude Codeの専門家で、日本のDX推進事例に詳しいコンサルタントです。

本日（{today}）は、以下の**日本国内3業界**におけるClaude Codeの実践ユースケースを1業界1件ずつ紹介してください。

【対象業界（必ず3つ全て含めること）】
1. 🏠 不動産業界（物件管理、契約書処理、顧客対応システムなど）
2. 🏭 製造業（生産管理、品質検査、設備保全、在庫システムなど）
3. 🏥 クリニック（電子カルテ、予約システム、レセプト処理、患者管理など）

【各ユースケースの条件】
- 日本の中小企業〜中堅企業の実態に即した課題を想定する
- 具体的な業務フロー（例:「エクセルで管理していた物件台帳を…」）を描写する
- Claude Codeでの実際の操作・コマンド例を含める
- 工数削減・コスト削減・ミス削減など定量的な効果を明記する
- 本日の日付（{today}）をシードとして、毎回異なるテーマ・課題を選択する

【出力形式 - Slack mrkdwn形式】

*🤖 Claude Code 業界別ユースケース｜{today}*
_対象: 日本の不動産業・製造業・クリニック向け実践事例_
━━━━━━━━━━━━━━━━━━━━━

*🏠 不動産業界｜[具体的なタイトル]*
*📋 想定企業:* [例: 地方の中小不動産会社（社員10名・物件500件管理）]
*😩 課題:* [具体的な業務上の問題]
*⚡ Claude Codeの活用:*
[具体的な操作・コマンド例を記述]
*📈 効果:* [定量的な効果（例: 契約書チェック時間が1件2時間→15分に短縮）]
*📖 参考:* [Anthropic公式事例 / 類似業界のDX事例等]

*🏭 製造業｜[具体的なタイトル]*
*📋 想定企業:* [例: 部品メーカー（従業員50名・工場1拠点）]
*😩 課題:* [具体的な業務上の問題]
*⚡ Claude Codeの活用:*
[具体的な操作・コマンド例を記述]
*📈 効果:* [定量的な効果]
*📖 参考:* [参考情報源]

*🏥 クリニック｜[具体的なタイトル]*
*📋 想定企業:* [例: 内科クリニック（医師2名・1日患者数80名）]
*😩 課題:* [具体的な業務上の問題]
*⚡ Claude Codeの活用:*
[具体的な操作・コマンド例を記述]
*📈 効果:* [定量的な効果]
*📖 参考:* [参考情報源]

━━━━━━━━━━━━━━━━━━━━━
💡 _詳しくは <https://docs.anthropic.com/ja/docs/claude-code/overview|Claude Code 公式ドキュメント（日本語）> へ_
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=3000,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# ── Slack に投稿 ────────────────────────────────
def post_to_slack(text: str) -> None:
    url = "https://slack.com/api/chat.postMessage"
    headers = {
        "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
        "Content-Type": "application/json; charset=utf-8",
    }
    payload = {
        "channel": SLACK_CHANNEL_ID,
        "text": text,
        "mrkdwn": True,
        "unfurl_links": False,
        "unfurl_media": False,
    }

    response = requests.post(url, headers=headers, json=payload, timeout=30)
    result = response.json()

    if not result.get("ok"):
        error = result.get("error", "unknown error")
        raise RuntimeError(f"Slack投稿に失敗しました: {error}")

    print(f"✅ Slack投稿成功！ ts={result.get('ts')}")


# ── メイン ──────────────────────────────────────
def main() -> None:
    print("🚀 Claude Code Daily Bot 起動...")

    try:
        print("📝 ユースケースを生成中...")
        use_cases = generate_use_cases()
        print("生成完了:\n", use_cases[:200], "...")

        print("📤 Slackに投稿中...")
        post_to_slack(use_cases)

        print("✨ 完了！")

    except KeyError as e:
        print(f"❌ 環境変数が設定されていません: {e}", file=sys.stderr)
        sys.exit(1)
    except anthropic.APIError as e:
        print(f"❌ Claude APIエラー: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
    except RuntimeError as e:
        print(f"❌ {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"❌ 予期しないエラー: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
