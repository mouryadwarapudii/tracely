"""Trace OpenAI chat calls. Run: python app.py"""
import tracely
from openai import OpenAI

tracely.init(service_name="openai-chat-app", environment="development")
client = OpenAI()

reply = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Explain what a trace is in one sentence."}],
)
print(reply.choices[0].message.content)

# Streaming is traced too. Ask for usage so token counts and cost are recorded.
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    stream=True,
    stream_options={"include_usage": True},
    messages=[{"role": "user", "content": "Now explain a span."}],
)
for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()

tracely.flush()  # short scripts exit before the background exporter runs
