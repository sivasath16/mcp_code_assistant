import { z } from "zod";
import path from "node:path";
import { writeFile, access, copyFile } from "node:fs/promises";
import { safeReadFile } from "../helpers/fs.js";
import { REPO_ROOT, MAX_BYTES, isAllowed } from "../helpers/config.js";
import { run } from "../helpers/process.js";

export function registerRepoTools(server) {
  // --- repo.file ---
  server.registerTool(
    "repo_file",
    {
      title: "Read a file from the repo",
      description: "Safely read a file with size caps (200KB default window).",
      inputSchema: {
        path: z.string(),
        start: z.number().optional(),
        end: z.number().optional(),
      },
    },
    async ({ path: rel, start = 0, end = MAX_BYTES }) => {
      const text = await safeReadFile(rel, start, end);
      return { content: [{ type: "text", text }] };
    }
  );

  // --- repo.search (ripgrep) ---
  server.registerTool(
    "repo_search",
    {
      title: "Search the repo with ripgrep",
      description:
        "Returns file, line, column, and a short match snippet.",
      inputSchema: {
        query: z.string(),
        maxResults: z.number().optional(),
      },
    },
    async ({ query, maxResults = 50 }) => {
      const rgCmd = process.env.RG_CMD || "rg";
      const SEARCH_ROOT = process.env.SEARCH_ROOT || ".";

      const args = [
        "--vimgrep", "-n", "-H",
        "--max-filesize", "1M",
        "--glob", "!.git",
        "--glob", "!node_modules",
        "--glob", "!dist",
        "--glob", "!build",
        "--glob", "!.venv",
        "--glob", "!venv",
        "--glob", "!__pycache__",
        "--glob", "!**/*.min.*",
        query,
        SEARCH_ROOT
      ];

      const { code, out, err } = await run(rgCmd, args, { timeoutMs: 60000 });

      if (code === -3 || (code === -1 && /Spawn failed/.test(err))) {
        throw new Error(
          "ripgrep (rg) not found. Install it or set RG_CMD to its full path in Inspector (Environment Variables)."
        );
      }
      if (code > 1) {
        throw new Error(`ripgrep failed: ${err || "unknown error"}`);
      }

      const lines = out ? out.split("\n").filter(Boolean) : [];
      const results = lines.slice(0, maxResults).map(line => {
        const [file, lineNo, col, ...rest] = line.split(":");
        return {
          file: path.relative(REPO_ROOT, file),
          line: Number(lineNo),
          col: Number(col),
          text: rest.join(":").slice(0, 200),
        };
      });

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  // --- repo.write_file (NEW) ---
  server.registerTool(
    "repo_write_file",
    {
      title: "Write file to repository",
      description: "Create or update files in the repo with backup option",
      inputSchema: {
        path: z.string(),
        content: z.string(),
        backup: z.boolean().optional(),
        overwrite: z.boolean().optional(),
      },
    },
    async ({ path: relPath, content, backup = true, overwrite = false }) => {
      const abs = path.resolve(REPO_ROOT, relPath);
      if (!isAllowed(abs)) {
        throw new Error("Access denied: path outside repo");
      }

      // Check if file exists
      let fileExists = false;
      try {
        await access(abs);
        fileExists = true;
      } catch {
        // File doesn't exist, which is fine
      }

      // If file exists and overwrite is false, ask for confirmation
      if (fileExists && !overwrite) {
        return {
          content: [{
            type: "text",
            text: `File ${relPath} already exists. Use overwrite: true to replace it.`
          }]
        };
      }

      // Backup existing file if requested
      if (fileExists && backup) {
        const backupPath = `${abs}.backup-${Date.now()}`;
        await copyFile(abs, backupPath);
      }

      // Write the file
      await writeFile(abs, content, 'utf8');

      return {
        content: [{
          type: "text",
          text: `✅ Successfully wrote ${content.length} characters to ${relPath}${fileExists && backup ? ' (backup created)' : ''}`
        }]
      };
    }
  );

  // --- repo.smart_context (NEW) ---
  server.registerTool(
    "repo_smart_context",
    {
      title: "Get relevant files for query",
      description: "Intelligently select files based on query relevance, recency, and importance",
      inputSchema: {
        query: z.string(),
        maxFiles: z.number().optional(),
        includeContent: z.boolean().optional(),
        fileTypes: z.array(z.string()).optional(),
      },
    },
    async ({ query, maxFiles = 5, includeContent = true, fileTypes = [] }) => {
      const results = [];

      // Step 1: Search for query matches
      const searchResults = await performSearch(query, maxFiles * 3);

      // Step 2: Get git status for recent files
      const recentFiles = await getRecentlyChangedFiles();

      // Step 3: Score and rank files
      const scoredFiles = await scoreFiles(searchResults, recentFiles, query, fileTypes);

      // Step 4: Select top files
      const selectedFiles = scoredFiles.slice(0, maxFiles);

      // Step 5: Get content if requested
      for (const file of selectedFiles) {
        const fileInfo = {
          path: file.path,
          score: file.score,
          reasons: file.reasons,
          size: 0
        };

        if (includeContent) {
          try {
            const content = await safeReadFile(file.path, 0, MAX_BYTES);
            fileInfo.content = content;
            fileInfo.size = content.length;
          } catch (error) {
            fileInfo.error = error.message;
          }
        }

        results.push(fileInfo);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            totalFiles: results.length,
            files: results
          }, null, 2)
        }]
      };
    }
  );

  // --- repo.analyze_project (NEW) ---
  server.registerTool(
    "repo_analyze_project",
    {
      title: "Analyze project structure and metadata",
      description: "Get comprehensive project overview including dependencies, structure, main files, and purpose",
      inputSchema: {
        depth: z.number().optional(),
        includeStats: z.boolean().optional(),
      },
    },
    async ({ depth = 2, includeStats = true }) => {
      const analysis = {
        metadata: await analyzeProjectMetadata(),
        structure: await analyzeProjectStructure(depth),
        mainFiles: await findMainFiles(),
        dependencies: await analyzeDependencies(),
        gitInfo: await analyzeGitRepository(),
        stats: includeStats ? await calculateProjectStats() : null,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(analysis, null, 2)
        }]
      };
    }
  );
}

// ============================================================================
// HELPER FUNCTIONS FOR NEW TOOLS
// ============================================================================

// Helper functions for smart_context
async function performSearch(query, limit) {
  const rgCmd = process.env.RG_CMD || "rg";
  const args = [
    "--files-with-matches",
    "--max-filesize", "1M",
    "--glob", "!.git",
    "--glob", "!node_modules",
    "--glob", "!dist",
    "--glob", "!build",
    query,
    "."
  ];

  const { code, out } = await run(rgCmd, args, { timeoutMs: 30000 });
  if (code > 1) return [];

  return out ? out.split('\n').filter(Boolean).slice(0, limit).map(file => ({
    path: path.relative(REPO_ROOT, file),
    matchType: 'content'
  })) : [];
}

async function getRecentlyChangedFiles() {
  try {
    const { code, out } = await run("git", ["diff", "--name-only", "HEAD~10..HEAD"], { timeoutMs: 10000 });
    if (code === 0 && out) {
      return out.split('\n').filter(Boolean);
    }
  } catch {
    // Not a git repo or other error
  }
  return [];
}

async function scoreFiles(searchResults, recentFiles, query, fileTypes) {
  const scored = [];

  for (const result of searchResults) {
    let score = 10; // Base score for having search matches
    const reasons = ['Contains search term'];

    // Boost for recent changes
    if (recentFiles.includes(result.path)) {
      score += 5;
      reasons.push('Recently modified');
    }

    // Boost for important file types
    const ext = path.extname(result.path);
    if (['.js', '.ts', '.py', '.java', '.go', '.rs'].includes(ext)) {
      score += 3;
      reasons.push('Source code file');
    }

    // Boost for configuration/documentation files
    const filename = path.basename(result.path).toLowerCase();
    if (['readme', 'package.json', 'config', 'dockerfile'].some(term => filename.includes(term))) {
      score += 4;
      reasons.push('Configuration/documentation file');
    }

    // Apply file type filter
    if (fileTypes.length > 0) {
      if (fileTypes.includes(ext.slice(1))) {
        score += 2;
        reasons.push('Matches requested file type');
      } else {
        score -= 5; // Penalize non-matching types
      }
    }

    scored.push({
      ...result,
      score,
      reasons
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}

// Helper functions for analyze_project
async function analyzeProjectMetadata() {
  const metadata = {
    name: null,
    type: "unknown",
    description: null,
    version: null,
    author: null,
    license: null
  };

  // Check for package.json (Node.js)
  try {
    const packageJson = await safeReadFile("package.json");
    const pkg = JSON.parse(packageJson);
    metadata.name = pkg.name;
    metadata.type = "nodejs";
    metadata.description = pkg.description;
    metadata.version = pkg.version;
    metadata.author = pkg.author;
    metadata.license = pkg.license;
  } catch {
    // Not a Node.js project
  }

  // Check for pyproject.toml or requirements.txt (Python)
  try {
    await safeReadFile("pyproject.toml");
    metadata.type = "python";
  } catch {
    try {
      await safeReadFile("requirements.txt");
      metadata.type = "python";
    } catch {
      // Not a Python project
    }
  }

  // Check for pom.xml or build.gradle (Java)
  try {
    await safeReadFile("pom.xml");
    metadata.type = "java-maven";
  } catch {
    try {
      await safeReadFile("build.gradle");
      metadata.type = "java-gradle";
    } catch {
      // Not a Java project
    }
  }

  // Check for go.mod (Go)
  try {
    await safeReadFile("go.mod");
    metadata.type = "go";
  } catch {
    // Not a Go project
  }

  return metadata;
}

async function analyzeProjectStructure(maxDepth) {
  const structure = {
    directories: [],
    files: [],
    totalFiles: 0,
    totalDirectories: 0
  };

  try {
    const { code, out } = await run("find", [".", "-maxdepth", String(maxDepth), "-type", "f"], { timeoutMs: 10000 });
    if (code === 0 && out) {
      structure.files = out.split('\n').filter(Boolean).map(f => f.replace('./', ''));
      structure.totalFiles = structure.files.length;
    }
  } catch {
    // Fallback for Windows or systems without find
    try {
      const { code, out } = await run("dir", ["/s", "/b"], { timeoutMs: 10000 });
      if (code === 0 && out) {
        structure.files = out.split('\n').filter(Boolean).map(f => path.relative(REPO_ROOT, f));
        structure.totalFiles = structure.files.length;
      }
    } catch {
      // Unable to get file listing
    }
  }

  return structure;
}

async function findMainFiles() {
  const mainFiles = [];
  const candidates = [
    "index.js", "index.ts", "main.js", "main.ts", "app.js", "app.ts",
    "main.py", "__main__.py", "app.py",
    "Main.java", "Application.java",
    "main.go", "cmd/main.go",
    "README.md", "README.rst", "README.txt",
    "package.json", "pyproject.toml", "pom.xml", "go.mod"
  ];

  for (const candidate of candidates) {
    try {
      await safeReadFile(candidate, 0, 1); // Just check if file exists
      mainFiles.push(candidate);
    } catch {
      // File doesn't exist
    }
  }

  return mainFiles;
}

async function analyzeDependencies() {
  const deps = {
    production: [],
    development: [],
    total: 0
  };

  try {
    const packageJson = await safeReadFile("package.json");
    const pkg = JSON.parse(packageJson);
    
    if (pkg.dependencies) {
      deps.production = Object.keys(pkg.dependencies);
    }
    if (pkg.devDependencies) {
      deps.development = Object.keys(pkg.devDependencies);
    }
    deps.total = deps.production.length + deps.development.length;
  } catch {
    // Not a Node.js project or no package.json
  }

  return deps;
}

async function analyzeGitRepository() {
  const gitInfo = {
    isGitRepo: false,
    branch: null,
    commitCount: 0,
    lastCommit: null,
    remoteUrl: null
  };

  try {
    // Check if it's a git repo
    const { code } = await run("git", ["rev-parse", "--is-inside-work-tree"], { timeoutMs: 5000 });
    if (code !== 0) return gitInfo;

    gitInfo.isGitRepo = true;

    // Get current branch
    const branchResult = await run("git", ["branch", "--show-current"], { timeoutMs: 5000 });
    if (branchResult.code === 0) {
      gitInfo.branch = branchResult.out.trim();
    }

    // Get commit count
    const countResult = await run("git", ["rev-list", "--count", "HEAD"], { timeoutMs: 5000 });
    if (countResult.code === 0) {
      gitInfo.commitCount = parseInt(countResult.out.trim());
    }

    // Get last commit info
    const lastCommitResult = await run("git", ["log", "-1", "--pretty=format:%H|%ad|%s", "--date=iso"], { timeoutMs: 5000 });
    if (lastCommitResult.code === 0) {
      const [hash, date, subject] = lastCommitResult.out.split('|');
      gitInfo.lastCommit = { hash, date, subject };
    }

    // Get remote URL
    const remoteResult = await run("git", ["remote", "get-url", "origin"], { timeoutMs: 5000 });
    if (remoteResult.code === 0) {
      gitInfo.remoteUrl = remoteResult.out.trim();
    }
  } catch {
    // Git operations failed
  }

  return gitInfo;
}

async function calculateProjectStats() {
  const stats = {
    totalLines: 0,
    totalBytes: 0,
    fileTypes: {},
    largestFiles: []
  };

  try {
    // Use find + wc for line counting (Unix systems)
    const { code, out } = await run("find", [".", "-name", "*.js", "-o", "-name", "*.ts", "-o", "-name", "*.py", "-o", "-name", "*.java", "-o", "-name", "*.go"], { timeoutMs: 15000 });
    
    if (code === 0 && out) {
      const files = out.split('\n').filter(Boolean);
      for (const file of files) {
        const ext = path.extname(file);
        stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
      }
    }
  } catch {
    // Fallback for systems without find
  }

  return stats;
}