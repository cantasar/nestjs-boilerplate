---
name: message
description: Write a message MD for another team (frontend, backend, flutter, design), or handle MDs that arrived in a communication inbox. Use when the user wants to tell or ask another team something, says a message was sent or answered, or drops a file into communication/<team>/inbox/.
argument-hint: "<team> <topic>"
---

# Team messages

Write in the MD language from `CLAUDE.md` → Project info. Short, plain sentences.

## Write a new message

1. File: `communication/<team>/will-send/<topic>.md` from `.claude/templates/message.md`.
   Name it in kebab-case, short and clear, no date: `login-response-change.md`.
2. Take endpoints, request and response examples and error codes from the real code and Swagger DTOs. Never include secrets or real user data.
3. Tell the user the file path and ask them to send it.

## Move it when its state changes (do it yourself)

- User says it was sent and it needs an answer: `will-send/` → `sent-waiting/`
- User says it was sent and no answer is needed: `will-send/` → `sent-done/`
- The answer arrived: `sent-waiting/` → `sent-done/`

## Handle the inbox

1. Read new MDs in `communication/<team>/inbox/` and sum each one up in two or three lines.
2. Suggest the next step: a task in `tasks/todo/`, a reply in `will-send/<topic>-reply.md`, or both. Ask before you create them.
3. When the thread is closed, move the inbox MD to `sent-done/` (it means "closed").
