"""
Claude Code 週次サマリーBot（毎週金曜21時）
#times-izumi の過去7日分の投稿を取得し、学習内容をサマリーして投稿する
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
SLACK_USER_ID     = os.environ.get("SLACK_USER_ID", "")   # izumikantaのユーザーID

JST = timezone(timedelta(hours=9))


def get_channel_history(days: int = 7) -> list[dict]:
    """Slack APIで過去N日分のチャンネル履歴を取得"""
    oldest = (datetime.now(timezone.utc) - timedelta(days=days)).timestamp()
    url = "https://slack.com/api/conversations.history"
    headers = {"Authorization": f"Bearer {SLACK_BOT_TOKEN}"}
    params = {
        "channel": SLACK_CHANNEL_ID,
        "oldest": str(oldest),
        "limit": 200,
    }
    response = requests.get(url, headers=headers, params=params, timeout=30)
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(f"Slack履歴取得に失敗: {result.get('error')}")
    return result.get("messages", [])


def filter_user_messages(messages: list[dict]) -> list[dict]:
    """ボットメッセージを除き、ユーザーの投稿だけ抽出"""
    user_msgs = []
    for msg in messages:
        # ボット投稿を除外
        if msg.get("bot_id") or msg.get("subtype"):
            continue
        # SLACK_USER_IDが設定されている場合はそのユーザーのみ
        if SLACK_USER_ID and msg.get("user") != SLACK_USER_ID:
            continue
        if msg.get("text", "").strip():
            user_msgs.append(msg)
    return user_msgs


def format_messages_for_summary(messages: list[dict]) -> str:
    """メッセージをClaude APIに渡すテキストに整形"""
    lines = []
    for msg in messages:
        ts = float(msg.get("ts", 0))
        dt = datetime.fromtimestamp(ts, JST).strftime("%-m/%-d %-H:%M")
        text = msg.get("text", "").replace("\n", " ")[:200]
        lines.append(f"[{dt}] {text}")
    return "\n".join(lines) if lines else "（今週の投稿なし）"


def generate_weekly_summary(messages_text: str, post_count: int) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    now = datetime.now(JST)
    week_end = now.strftime("%-m月%-d日")
    week_start = (now - timedelta(days=6)).strftime("%-m月%-d日")

    prompt = f"""
あなたはClaude Codeの学習コーチです。

以下は #times-izumi チャンネルにおける今週（{week_start}〜{week_end}）のユーザー投稿です。
この内容をもとに「週次学習サマリー」を作成してください。

【今週の投稿内容】
{messages_text}

【条件】
- 投稿が少なくても（0件でも）ポジティブなトーンを維持する
- 投稿から読み取れる「学習テーマ」「気づき」「試したこと」を抽出する
- 来週に向けた具体的なアドバイスを1つ添える
- 投稿数: {post_count}件

【出力形式 - Slack mrkdwn形式】

*📊 今週の学習サマリー｜{week_start}〜{week_end}*
━━━━━━━━━━━━━━━━━━━━━

*【今週のあなた】*
投稿数: {post_count}件 {"🔥 " * min(post_count, 5) if post_count > 0 else ""}

*【今週触れたテーマ】*
[投稿から読み取れるテーマを箇条書き。投稿がない場合は「今週はインプット週間でしたね！」]

*【気づき・学び】*
[投稿内容から読み取れる学びや発見を2〜3行で]

*【来週のおすすめ】*
[今週の傾向を踏まえた、来週取り組むと良いテーマや深掘り方向を1つ具体的に]

継続することが最強の学習法です。来週もお楽しみに！ 🚀
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
    print("🚀 週次サマリーBot 起動...")
    try:
        print("📥 チャンネル履歴を取得中...")
        messages = get_channel_history(days=7)
        user_msgs = filter_user_messages(messages)
        print(f"ユーザー投稿: {len(user_msgs)}件")

        messages_text = format_messages_for_summary(user_msgs)

        print("📝 サマリーを生成中...")
        summary = generate_weekly_summary(messages_text, len(user_msgs))
        print("生成完了:\n", summary[:200], "...")

        post_to_slack(summary)
        print("✨ 完了！")
    except Exception as e:
        print(f"❌ エラー: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
