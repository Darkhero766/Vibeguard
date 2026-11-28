export type DetectedStack = {
  languages: string[];
  frameworks: string[];
  platforms: string[];
  packageManagers: string[];
};

type RepoFile = { path: string; content?: string };

export function detectStack(files: RepoFile[]): DetectedStack {
  const paths = new Set(files.map((f) => f.path.toLowerCase()));
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const platforms = new Set<string>();
  const packageManagers = new Set<string>();

  const has = (name: string) => paths.has(name.toLowerCase());
  const any = (...names: string[]) => names.some((name) => has(name));
  const text = files.filter((f) => f.content).map((f) => f.content).join("\n");

  if ([...paths].some((p) => /\.(tsx?|jsx?)$/i.test(p))) languages.add("JavaScript/TypeScript");
  if ([...paths].some((p) => /\.(py|pyi)$/i.test(p)) || any("requirements.txt", "pyproject.toml", "poetry.lock")) languages.add("Python");
  if (any("go.mod", "go.sum") || [...paths].some((p) => /\.go$/i.test(p))) languages.add("Go");
  if (any("cargo.toml", "cargo.lock") || [...paths].some((p) => /\.rs$/i.test(p))) languages.add("Rust");
  if (any("pom.xml", "build.gradle", "build.gradle.kts") || [...paths].some((p) => /\.java$/i.test(p))) languages.add("Java");
  if ([...paths].some((p) => /\.kt$/i.test(p)) || any("build.gradle.kts")) languages.add("Kotlin");
  if (any("gemfile", "gemfile.lock") || [...paths].some((p) => /\.rb$/i.test(p))) languages.add("Ruby");
  if (any("composer.json", "composer.lock") || [...paths].some((p) => /\.php$/i.test(p))) languages.add("PHP");
  if (any(".csproj", ".sln") || [...paths].some((p) => /\.cs$/i.test(p))) languages.add("C#");
  if (any("package.swift") || [...paths].some((p) => /\.swift$/i.test(p))) languages.add("Swift");

  if (has("package.json")) packageManagers.add("npm-compatible");
  if (has("pnpm-lock.yaml")) packageManagers.add("pnpm");
  if (has("yarn.lock")) packageManagers.add("Yarn");
  if (has("bun.lockb") || has("bun.lock")) packageManagers.add("Bun");
  if (has("poetry.lock")) packageManagers.add("Poetry");
  if (has("uv.lock")) packageManagers.add("uv");
  if (has("cargo.lock")) packageManagers.add("Cargo");
  if (has("go.sum")) packageManagers.add("Go modules");

  if (any("next.config.js", "next.config.mjs", "next.config.ts")) frameworks.add("Next.js");
  if (/\bfrom\s+["'](?:react|react-dom)["']|\breact\b/i.test(text)) frameworks.add("React");
  if (any("vite.config.js", "vite.config.ts", "vite.config.mjs")) frameworks.add("Vite");
  if (any("nuxt.config.ts", "nuxt.config.js")) frameworks.add("Nuxt");
  if (any("angular.json")) frameworks.add("Angular");
  if (any("svelte.config.js", "svelte.config.ts")) frameworks.add("Svelte");
  if (any("manage.py")) frameworks.add("Django");
  if (/from\s+fastapi\s+import|import\s+fastapi/i.test(text)) frameworks.add("FastAPI");
  if (/from\s+flask\s+import|import\s+flask/i.test(text)) frameworks.add("Flask");
  if (any("artisan")) frameworks.add("Laravel");
  if (any("config/routes.rb")) frameworks.add("Rails");
  if (any("prisma/schema.prisma")) frameworks.add("Prisma");

  if (/\b(?:@?supabase\/|createClient\s*\(|SUPABASE_SERVICE_ROLE_KEY|supabase\.co)\b/i.test(text) || [...paths].some((p) => p.includes("supabase"))) platforms.add("Supabase");
  if (/\b(?:firebase|firebase-admin|firebaseConfig)\b/i.test(text) || [...paths].some((p) => p.includes("firebase"))) platforms.add("Firebase");
  if (/(?:from\s+["']openai["']|require\(["']openai["']\)|api\.openai\.com|OPENAI_API_KEY)/i.test(text)) platforms.add("OpenAI");
  if (/(?:from\s+["']@anthropic-ai\/sdk["']|api\.anthropic\.com|ANTHROPIC_API_KEY)/i.test(text)) platforms.add("Anthropic");
  if (/(?:generativelanguage\.googleapis\.com|GEMINI_API_KEY|@google\/generative-ai)/i.test(text)) platforms.add("Google Gemini");
  if (/(?:groq-sdk|api\.groq\.com|GROQ_API_KEY)/i.test(text)) platforms.add("Groq");
  if (/(?:openrouter\.ai|OPENROUTER_API_KEY)/i.test(text)) platforms.add("OpenRouter");
  if (/(?:langchain|@langchain\/|langchain_)/i.test(text)) platforms.add("LangChain");
  if (/(?:llama-index|llama_index)/i.test(text)) platforms.add("LlamaIndex");
  if (any("vercel.json") || /VERCEL_URL|VERCEL_ENV/i.test(text)) platforms.add("Vercel");
  if (any("netlify.toml") || /NETLIFY/i.test(text)) platforms.add("Netlify");

  return {
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    platforms: [...platforms].sort(),
    packageManagers: [...packageManagers].sort(),
  };
}
