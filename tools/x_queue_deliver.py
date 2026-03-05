#!/usr/bin/env python3
"""
X投稿キュー配信スクリプト
========================
GitHub Actionsおよびローカルでの実行に対応。
"""
import os, sys, json, ssl
import urllib.request, urllib.parse
from datetime import datetime

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUEUE_FILE = os.path.join(PROJECT_ROOT, "tools", "config", "x_post_queue.json")

# GitHub ActionsのSecrets(またはローカルの環境変数)から取得
SLACK_TOKEN = os.environ.get("SLACK_BOT_TOKEN")
SLACK_CHANNEL = "C083SR8SX24"
USER_ID = "U082PFM1VN3"
ssl._create_default_https_context = ssl._create_unverified_context

def log(msg): print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def load_queue():
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f: return json.load(f)
    except: return []

def save_queue(q):
    os.makedirs(os.path.dirname(QUEUE_FILE), exist_ok=True)
    with open(QUEUE_FILE, "w", encoding="utf-8") as f: json.dump(q, f, ensure_ascii=False, indent=2)

def slack_post(text):
    url = "https://slack.com/api/chat.postMessage"
    headers = {"Authorization": f"Bearer {SLACK_TOKEN}", "Content-Type": "application/x-www-form-urlencoded"}
    data = urllib.parse.urlencode({"channel": SLACK_CHANNEL, "text": text}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read()).get("ok", False)
    except Exception as e:
        log(f"Slack API Error: {e}")
        return False

def deliver():
    queue = load_queue()
    if not queue:
        slack_post(f"<@{USER_ID}> ⚠️ X投稿のストックが空になりました。Claudeに「業務改善・HubSpot関連のネタを追加して」と依頼してください。")
        log("📭 キュー空。リマインド送信。"); return

    post = queue.pop(0)
    save_queue(queue)

    msg = f"<@{USER_ID}> 📝 *X投稿案* — {post['category']}\n\n{post['text']}"
    if slack_post(msg):
        log(f"✅ 配信: {post['theme']}（残り{len(queue)}件）")
    else:
        log("❌ Slack投稿失敗"); queue.insert(0, post); save_queue(queue)

    # 残り少なければリマインド
    if len(queue) <= 6 and len(queue) > 0:
        slack_post(f"<@{USER_ID}> 📊 X投稿ストック残り *{len(queue)}件* です。Claudeに「業務改善・HubSpot関連のネタを追加して」と依頼してください。")

def status():
    queue = load_queue()
    log(f"📊 キュー残り: {len(queue)}件")
    for i, p in enumerate(queue, 1):
        log(f"  {i}. [{p['category']}] {p['theme']}")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "deliver"
    if cmd == "status": status()
    else: deliver()
