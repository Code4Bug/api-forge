---
alwaysApply: true
scene: git_message
---

使用中文编写提交信息
type: commit-message
format: |
  <type>(<scope>): <subject>

  <body>

  <footer>
rules:
  - type 可选值: feat, fix, docs, style, refactor, test, chore
  - subject 不超过 50 个字符
  - body 每行不超过 72 个字符
  - footer 用于引用 issue 或 breaking changes
  - 整个提交信息使用中文编写
