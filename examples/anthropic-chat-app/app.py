"""Trace Anthropic message calls. Run: python app.py [model]"""
import sys

import tracely
from anthropic import Anthropic

tracely.init(service_name="anthropic-chat-app", environment="development")
client = Anthropic()
model = sys.argv[1] if len(sys.argv) > 1 else "claude-sonnet-4-5"  # pass a current model name if this one is retired

with tracely.session("demo-conversation", user_id="demo-user"):
    reply = client.messages.create(
        model=model,
        max_tokens=200,
        system="Answer in one sentence.",
        messages=[{"role": "user", "content": "Why do LLM apps need observability?"}],
    )
print(reply.content[0].text)
tracely.flush()
