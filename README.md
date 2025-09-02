# MCP Code Assistant

An **AI-powered Model Context Protocol (MCP) server** that gives LLMs live access to your codebase, git history, docs, runtime state, and GitHub issues/PRs.  
Think of it as an open, customizable version of Cursor or Copilot Chat — but you control it.

---

## ✨ Features
- 🔍 **Repository tools**: read files, search with [ripgrep](https://github.com/BurntSushi/ripgrep)  
- 📜 **Git tools**: list changes, diffs, commits, create commits  
- 📖 **Docs tools**: read/search/list common documentation files  
- 🐛 **Runtime tools**: list processes, tail logs, check ports  
- 📝 **GitHub tools**: list issues & PRs via [gh CLI](https://cli.github.com/)  

---

## 📦 Requirements
- [Node.js](https://nodejs.org/) ≥ 18
- [ripgrep (rg)](https://github.com/BurntSushi/ripgrep) (for `repo.search`, `docs.search`)
- [git](https://git-scm.com/) (for git tools)
- (Optional) [gh CLI](https://cli.github.com/) (for issues/PRs)

---

## 🚀 Installation

### Option 1: Clone and run locally
```
git clone https://github.com/<your-username>/mcp-code-assistant.git
cd mcp-code-assistant
npm install
```

**Run With:**
```
npx @modelcontextprotocol/inspector node ./server.mjs --root "/path/to/your/project"
```
