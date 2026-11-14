"""A small tool-using agent, grouped into one session so it can be replayed step by step.

Create a prompt named `weather-agent` in the Prompt hub first, for example:
    You are a weather assistant for {{company}}. Use the tool, then answer briefly.
Without it the script falls back to a built-in prompt.
"""
import json

import tracely
from openai import OpenAI

tracely.init(service_name="agent-session-app", environment="development")
client = OpenAI()

TOOLS = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Current weather for a city",
        "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]},
    },
}]


@tracely.tool
def get_weather(city: str) -> dict:
    return {"city": city, "temp_c": 21, "sky": "clear"}


def system_prompt() -> str:
    try:
        return tracely.get_prompt("weather-agent").compile(company="Northwind")
    except Exception:
        return "You are a weather assistant. Use the tool, then answer briefly."


@tracely.agent(name="weather-agent")
def answer(question: str) -> str:
    messages = [{"role": "system", "content": system_prompt()}, {"role": "user", "content": question}]
    while True:
        reply = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=TOOLS).choices[0].message
        if not reply.tool_calls:
            return reply.content
        messages.append(reply)
        for call in reply.tool_calls:
            result = get_weather(**json.loads(call.function.arguments))
            messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})


with tracely.session("weather-chat-1", user_id="demo-user"):
    print(answer("What's the weather in Hyderabad?"))
    print(answer("And in Bengaluru?"))

tracely.flush()
