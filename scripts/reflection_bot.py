"""
Claude Code 振り返りBot（夜21時）
今日のテーマを振り返り、明日への予告で継続モチベーションを維持する
"""

import os
import sys
import traceback
from datetime import datetime, timezone, timedelta
import requests
import anthropic

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
SLACK_BOT_TOKEN   = os.environ["SLACK_BOT_TOKEN"]
SLACK_CHANNEL_ID  = os.environ["SLACK_CHANNEL_ID"]

JST = timezone(timedelta(hours=9))


def generate_reflection() -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    today = datetime.now(JST).strftime("%Y年%-m月%-d日")
    tomorrow = (datetime.now(JST) + timedelta(days=1)).strftime("%-m月%-d日")

    prompt = f"""
あなたはClaude Codeの学習コーチです。

本日（{today}）、不動産業界・製造業・クリニック向けのClaude Codeユースケースを朝と昼に通知しました。
夜21時の「振り返り通知」を作成してください。

【条件】
- 今日1日の学習の振り返りを促す
- 「試せた人」「まだの人」両方に向けたメッセージを含める
- 明日（{tomorrow}）への期待感を高める予告を含める
- 日付（{today}）をシードにして毎日内容を少し変化させる
- 短くてテンポよく読める文章にする（長すぎない）

【出力形式 - Slack mrkdwn形式】

*🔄 今日の振り返り｜{today}*
━━━━━━━━━━━━━━━━━━━━━

今日のClaude Code学習、お疲れ様でした！

*【今日のテーマ】*
🏠 不動産 / 🏭 製造業 / 🏥 クリニック の業務効率化

✅ *試せた方へ:*
[試した感想や発見をスレッドに書いてみよう、という短い一言]

📌 *まだの方へ:*
[気軽な一言。明日また新しい事例が来ることを伝える]

*🔮 明日（{tomorrow}）の予告:*
[明日はどんな業界・テーマかを簡単に予告する。日付シードで決める]

継続は力なり！明日もお楽しみに 🚀
━━━━━━━━━━━━━━━━━━━━━
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


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
    }
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack投稿に失敗しました: {result.get('error')}")
    print(f"✅ Slack投稿成功！ ts={result.get('ts')}")


def main() -> None:
    print("🚀 振り返りBot 起動...")
    try:
        print("📝 振り返りメッセージを生成中...")
        reflection = generate_reflection()
        print("生成完了:\n", reflection[:200], "...")
        post_to_slack(reflection)
        print("✨ 完了！")
    except Exception as e:
        print(f"❌ エラー: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
