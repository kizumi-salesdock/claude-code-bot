"""
Claude Code Daily Slack Bot
毎朝8時（JST）に Claude Code のユースケースを生成して #times-izumi に投稿する
"""

import os
import sys
import json
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
あなたはClaude Codeの専門家です。
本日（{today}）の「Claude Codeの実践的ユースケース」を3つ紹介してください。

以下の条件で生成してください：
- 実際の開発現場で使える具体的な内容
- 毎回違うテーマ（コードレビュー、テスト生成、リファクタリング、ドキュメント生成、バグ修正、API設計、DB設計など）
- ランダム性をもたせるため、本日の日付（{today}）をシードとして使い、テーマを選んでください
- 各ユースケースに：タイトル・課題・Claude Codeの活用方法・期待効果を含める

出力形式（Slackのmrkdwn形式で、そのままSlack Blockに渡せる形）：

*🤖 Claude Code 今日のユースケース｜{today}*
━━━━━━━━━━━━━━━━━━━━━

*📌 ① [タイトル]*
*課題:* [具体的な課題の説明]
*活用方法:* [Claude Codeの使い方]
*期待効果:* [数値や具体的な効果]

*📌 ② [タイトル]*
*課題:* [具体的な課題の説明]
*活用方法:* [Claude Codeの使い方]
*期待効果:* [数値や具体的な効果]

*📌 ③ [タイトル]*
*課題:* [具体的な課題の説明]
*活用方法:* [Claude Codeの使い方]
*期待効果:* [数値や具体的な効果]

━━━━━━━━━━━━━━━━━━━━━
🔗 <https://docs.anthropic.com/ja/docs/claude-code/overview|Claude Code 公式ドキュメント>
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1500,
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
        sys.exit(1)
    except RuntimeError as e:
        print(f"❌ {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
