#!/usr/bin/env python3
"""
X投稿ネタ自動生成スクリプト
===========================
Slack（#minutes, #general）から直近の履歴を取得し、
Gemini APIを用いてBtoB向け「X投稿ネタ」を自動生成。
生成されたネタを x_post_queue.json に追加します。
"""

import os
import sys
import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import ssl

# --- Configuration ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_FILE = os.path.join(PROJECT_ROOT, "tools", "config", "x_post_queue.json")

# Environmental Variables (from GitHub Actions Secrets)
SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

SOURCE_CHANNELS = ["C08EM8F6REF", "C083SR8SX24", "C087RV7D97T"] # #minutes, #general, #times-izumi
MAX_MESSAGES_PER_CH = 15

ssl._create_default_https_context = ssl._create_unverified_context

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def load_queue():
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_queue(queue):
    os.makedirs(os.path.dirname(QUEUE_FILE), exist_ok=True)
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)

def fetch_slack_history():
    """Slackから過去のアクティビティを取得"""
    messages = []
    log("Slackの履歴を取得中...")
    url = "https://slack.com/api/conversations.history"
    
    # 過去2日分のデータ（直近の議事録など）を取得
    oldest_ts = (datetime.now() - timedelta(days=2)).timestamp()
    
    for channel in SOURCE_CHANNELS:
        params = urllib.parse.urlencode({
            "channel": channel,
            "limit": MAX_MESSAGES_PER_CH,
            "oldest": oldest_ts
        })
        req = urllib.request.Request(f"{url}?{params}")
        req.add_header("Authorization", f"Bearer {SLACK_TOKEN}")
        
        try:
            with urllib.request.urlopen(req) as response:
                res = json.loads(response.read())
                if res.get("ok"):
                    for msg in res["messages"]:
                        # ボットの発言は除外
                        if "text" in msg and not msg.get("bot_id"):
                            messages.append(msg['text'])
                else:
                    log(f"Slack API Error ({channel}): {res.get('error')}")
        except Exception as e:
            log(f"Slack通信エラー ({channel}): {e}")
            
    return messages

def call_anthropic(prompt):
    """Anthropic API(Claude)を呼び出してコンテンツ生成"""
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    data = json.dumps({
        "model": "claude-3-7-sonnet-20250219",
        "max_tokens": 4000,
        "temperature": 0.8,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }).encode("utf-8")
    
    try:
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read())
            return result["content"][0]["text"]
    except urllib.error.HTTPError as e:
        log(f"Anthropic API Error: {e.read().decode()}")
        return None
    except Exception as e:
        log(f"Anthropic API通信エラー: {e}")
        return None

def generate_posts(context_messages):
    """LLMを用いてX投稿のJSONを生成"""
    log("Claude API(Anthropic)でX投稿ネタを生成中...")
    
    # テキストが多すぎる場合は切り詰め
    context_text = "\n---\n".join(context_messages)[:8000]
    
    prompt = f"""あなたはBtoB中小企業の営業改善・事業モニタリングの専門家「いずみ」として、現場のリアルなインサイトを発信するプロのX(Twitter)運用者です。

■ プロフィール
SalesDock代表。ターゲットは従業員30〜100名のBtoB中小企業の経営者・営業マネージャー。
「HubSpot/CRM活用」「業務改善/DX」「組織マネジメント」「営業とマーケの連携」などを得意テーマとしています。

■ 指示
以下の【最近の社内チャット・議事録】の文脈からインスピレーションを得て、X（Twitter）の投稿ネタを「5件」作成してください。

【最近の社内チャット・議事録】
{context_text}

■ 投稿の品質基準（厳守）
1. 箇条書きや改行をうまく使い、スマホで読みやすい構成をつくること。
2. 抽象的で教科書的な表現は禁止。具体的なシーン、感情、役職名（例: 営業部長、プレイングマネージャー）、数字を使うこと。
3. 最後に「本人の問題ではなく仕組み（構造）の問題だ」という専門家としての鋭い気づきで締める。
4. 売り込み、絵文字の多用、ハッシュタグは禁止。
5. 必ず下記のJSON形式で出力すること（コードブロックのみ、他の文章は一切含めない）。

■ 出力形式
```json
[
  {{
    "category": "カテゴリ（例：HubSpot活用・CRM / 業務改善・組織 など）",
    "theme": "20文字以内の短くキャッチーなテーマ・見出し",
    "text": "投稿の本文（300〜500文字程度、適切な改行を含む）"
  }},
  ...（残り4件）
]
```
"""

    result = call_anthropic(prompt)
    if not result:
        return None
        
    try:
        # JSON部分の抽出
        if "```json" in result:
            result = result.split("```json")[1].split("```")[0]
        elif "```" in result:
            result = result.split("```")[1].split("```")[0]
            
        posts = json.loads(result.strip())
        return posts
    except Exception as e:
        log(f"生成データのJSONパースに失敗しました: {e}\n{result[:500]}")
        return None

def main():
    if not SLACK_TOKEN or not ANTHROPIC_API_KEY:
        log("❌ 環境変数 SLACK_BOT_TOKEN または ANTHROPIC_API_KEY が設定されていません。")
        sys.exit(1)
        
    messages = fetch_slack_history()
    if not messages:
        log("⚠️ 参考にするメッセージ履歴が取得できませんでした。適当なテーマで生成を試みます。")
        messages = ["中小企業の営業課題", "CRMの定着", "マネージャーのプレイング化"]
        
    posts = generate_posts(messages)
    
    if not posts:
        log("❌ 投稿の生成に失敗しました。")
        sys.exit(1)
        
    # JSONのバリデーションと保存
    valid_posts = []
    for p in posts:
        if isinstance(p, dict) and "category" in p and "theme" in p and "text" in p:
            valid_posts.append(p)
            
    if valid_posts:
        queue = load_queue()
        queue.extend(valid_posts)
        save_queue(queue)
        log(f"✅ {len(valid_posts)} 件の新しい投稿ネタをキューに追加しました。現在のキュー総数: {len(queue)}件")
    else:
        log("❌ 有効な投稿データが生成されませんでした。")
        sys.exit(1)

if __name__ == "__main__":
    main()
