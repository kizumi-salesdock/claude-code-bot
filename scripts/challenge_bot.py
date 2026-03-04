"""
Claude Code ミニチャレンジBot（昼12時）
今日のテーマに合わせた「5分で試せるコマンド1つ」を通知する
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


def generate_challenge() -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    today = datetime.now(JST).strftime("%Y年%-m月%-d日")

    prompt = f"""
あなたはClaude Codeを教えるメンターです。

本日（{today}）、不動産業界・製造業・クリニックの3業界向けのClaude Codeユースケースを朝に紹介しました。
今度は「今日の昼休みに5分で試せる入門チャレンジ」を1つだけ紹介してください。

【条件】
- エディタやターミナルがあればすぐ試せるレベル（初心者向け）
- Claude Codeの実際のコマンドまたはプロンプト例を1つ含める
- 日付（{today}）をシードにして毎日異なるテーマにする
- 業界は不動産・製造業・クリニックのどれかから選ぶ
- 楽しく試したくなるような文体にする

【出力形式 - Slack mrkdwn形式】

*⚡ Claude Code 5分チャレンジ｜{today}*
━━━━━━━━━━━━━━━━━━━━━

今朝の業界別ユースケース、見ましたか？
昼休みの5分で今日のテーマを実際に体験してみましょう！

*🎯 今日のチャレンジ: [タイトル]*
*🏷️ 対象業界:* [不動産 or 製造業 or クリニック]
*⭐ 難易度:* [初級 / 中級]
*⏱️ 所要時間:* [5分 / 10分]

*【今すぐ試せるコマンド】*
```
[実際のClaude Codeコマンドまたはプロンプト]
```

*💡 ヒント:* [つまずきやすいポイントと解決策]

試したら、このメッセージに *スレッドで感想を返信* してみてください！
学習の記録になります 📝
━━━━━━━━━━━━━━━━━━━━━
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1500,
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
    print("🚀 チャレンジBot 起動...")
    try:
        print("📝 チャレンジを生成中...")
        challenge = generate_challenge()
        print("生成完了:\n", challenge[:200], "...")
        post_to_slack(challenge)
        print("✨ 完了！")
    except Exception as e:
        print(f"❌ エラー: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
